/**
 * Tunn klient mot API-Football v3 (https://v3.football.api-sports.io).
 *
 * Två saker att respektera:
 *   - Anrop/MINUT — på gratisplanen 10/min (7s mellanrum). På Ultra
 *     (2026-08-20, Allsvenskan Datalager-projektet) testades detta EMPIRISKT
 *     inför steg 4:s ~2900-anropsimport: 50 anrop i rad med 150ms mellanrum
 *     gav 0 st 429. Satt till 250ms (4/s) som en säkerhetsmarginal under den
 *     testade gränsen — inte gissat. Skulle steg 4 tagit 5,6 timmar med den
 *     gamla 7s-throttlen hade Ultra-planen inte gått att använda praktiskt.
 *   - Anrop/DYGN — 75 000 på Ultra (100 på gratisplanen). Loggar kvarvarande
 *     kvot per anrop, kastar tydligt fel om kvoten tar slut mitt i en körning.
 * Vissa endpoints/säsonger kräver betald plan (t.ex. innevarande säsong) —
 * API:t svarar då 200 med ett "errors"-objekt snarare än en HTTP-felkod, så
 * vi måste kolla efter det explicit.
 * Om vi ändå träffar minutgränsen (HTTP 429) väntar vi och försöker igen
 * istället för att krascha hela import-körningen.
 */

const BASE_URL = "https://v3.football.api-sports.io";
const MIN_MS_BETWEEN_CALLS = 250; // Ultra, empiriskt testat — se kommentar ovan
const MAX_429_RETRIES = 3;
const RETRY_BACKOFF_MS = 15000;

export class ApiFootballError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

interface RawResponse<T> {
  errors: unknown;
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

let lastCallAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_MS_BETWEEN_CALLS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_MS_BETWEEN_CALLS - elapsed));
  }
  lastCallAt = Date.now();
}

function hasErrors(errors: unknown): boolean {
  if (Array.isArray(errors)) return errors.length > 0;
  if (errors && typeof errors === "object") return Object.keys(errors).length > 0;
  return false;
}

export async function apiFootballGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retriesLeft = MAX_429_RETRIES
): Promise<{ data: T[]; results: number; paging: { current: number; total: number } }> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new ApiFootballError("Saknar API_FOOTBALL_KEY i miljövariablerna.");
  }

  await throttle();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers: { "x-apisports-key": apiKey } });

  if (response.status === 429) {
    if (retriesLeft <= 0) {
      throw new ApiFootballError("Träffade minutgränsen (429) upprepade gånger, ger upp.", 429);
    }
    console.warn(
      `  [api-football] 429 (minutgräns), väntar ${RETRY_BACKOFF_MS / 1000}s och försöker igen...`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return apiFootballGet<T>(path, params, retriesLeft - 1);
  }

  const remaining = response.headers.get("x-ratelimit-requests-remaining");
  const dayLimit = response.headers.get("x-ratelimit-requests-limit");
  if (remaining !== null) {
    console.log(`  [api-football] ${path} — kvar idag: ${remaining}/${dayLimit ?? "?"}`);
    if (Number(remaining) <= 3) {
      throw new ApiFootballError(
        `Dagskvoten är nästan slut (${remaining} kvar) — avbryter för att inte gå över.`
      );
    }
  }

  if (!response.ok) {
    throw new ApiFootballError(`API-Football svarade HTTP ${response.status}`, response.status);
  }

  const json = (await response.json()) as RawResponse<T>;

  if (hasErrors(json.errors)) {
    throw new ApiFootballError(`API-Football fel: ${JSON.stringify(json.errors)}`);
  }

  return { data: json.response, results: json.results, paging: json.paging };
}

/** Hämtar alla sidor för en paginerad endpoint (t.ex. /players). */
export async function apiFootballGetAllPages<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { data, paging } = await apiFootballGet<T>(path, { ...params, page });
    all.push(...data);
    totalPages = paging.total || 1;
    page += 1;
  } while (page <= totalPages);

  return all;
}
