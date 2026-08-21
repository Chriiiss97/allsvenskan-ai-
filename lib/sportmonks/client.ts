/**
 * Tunn klient mot Sportmonks API v3 (https://api.sportmonks.com/v3/ — INTE
 * /api/v3/, testat empiriskt med curl-statuskoder över flera path-
 * permutationer, se Sportmonks-research-sessionen).
 *
 * OBS: fotbollsspecifika endpoints (fixtures/leagues/lineups/...) ligger
 * under /v3/football/, men REFERENSDATA (t.ex. /v3/core/types) ligger under
 * en SYSKON-namespace /v3/core/ — INTE under /v3/football/core/. Bekräftat
 * genom att 404-testa den felaktiga sammansättningen innan denna kommentar
 * skrevs. sportmonksGet() tar därför en fullständig path RELATIV /v3/ (t.ex.
 * "football/fixtures/123" eller "core/types"), inte relativ /v3/football/.
 *
 * Autentisering: `api_token`-query-param (bekräftat fungerande, inte header).
 *
 * Kvot — BEKRÄFTAT via riktiga svarshuvuden (x-ratelimit-limit/-remaining),
 * inte gissat, plus Sportmonks egen dokumentation (docs.sportmonks.com/v3/
 * api/rate-limit): 2000 anrop/TIMME för vår plan, räknat PER ENTITET (t.ex.
 * fixtures och core/types har separata kvoter — en stor types-hämtning äter
 * alltså inte av fixture-kvoten). Detta är en betydligt rymligare budget än
 * API-Footballs per-minut-gräns (lib/api-football/client.ts), så samma
 * 250ms-säkerhetsmarginal (redan empiriskt beprövad där för en annan men
 * jämförbar situation) återanvänds här som en försiktig start snarare än en
 * ny gissning — justera om en full backfill-körning visar att det är
 * onödigt konservativt.
 *
 * Sportmonks svarar HTTP 429 vid överskriden kvot (samma mönster som
 * API-Football) — vi väntar och försöker igen istället för att krascha hela
 * import-körningen, exakt samma disciplin som redan finns där.
 */

const BASE_URL = "https://api.sportmonks.com/v3/";
const MIN_MS_BETWEEN_CALLS = 250;
const MAX_429_RETRIES = 3;
const RETRY_BACKOFF_MS = 15000;

export class SportmonksError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "SportmonksError";
  }
}

interface RawResponse<T> {
  data: T;
  message?: string;
  pagination?: { count: number; per_page: number; current_page: number; next_page: string | null; has_more: boolean };
}

let lastCallAt = 0;

// Senast sedda kvot-avläsning per entitet (t.ex. "fixtures", "core/types") —
// samma "läs API:ts egna headers, approximera inget"-princip som
// lib/api-football/client.ts:s getLastRateLimitReading().
const lastRateLimitReadings = new Map<string, { remaining: number; limit: number }>();

export function getLastSportmonksRateLimitReading(entity: string): { remaining: number; limit: number } | null {
  return lastRateLimitReadings.get(entity) ?? null;
}

function entityFromPath(path: string): string {
  const segments = path.replace(/^\/+/, "").split("/");
  // "football/fixtures/123" -> "fixtures" (den faktiska Sportmonks-entiteten);
  // "core/types" -> "core/types" (core-namespacet har sin egen samlade budget).
  if (segments[0] === "football" && segments[1]) return segments[1];
  return segments.slice(0, 2).join("/") || path;
}

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_MS_BETWEEN_CALLS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_MS_BETWEEN_CALLS - elapsed));
  }
  lastCallAt = Date.now();
}

/**
 * Hämtar EN Sportmonks-endpoint (fixture/team/etc — inte core/types, se
 * sportmonksGetTypes nedan för den paginerade varianten).
 */
export async function sportmonksGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retriesLeft = MAX_429_RETRIES
): Promise<{ data: T; message?: string; pagination?: RawResponse<T>["pagination"] }> {
  const apiToken = process.env.SPORTMONKS_API_TOKEN;
  if (!apiToken) {
    throw new SportmonksError("Saknar SPORTMONKS_API_TOKEN i miljövariablerna.");
  }

  await throttle();

  const url = new URL(`${BASE_URL}${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);

  if (response.status === 429) {
    if (retriesLeft <= 0) {
      throw new SportmonksError("Träffade timkvoten (429) upprepade gånger, ger upp.", 429);
    }
    console.warn(`  [sportmonks] 429 (kvot), väntar ${RETRY_BACKOFF_MS / 1000}s och försöker igen...`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return sportmonksGet<T>(path, params, retriesLeft - 1);
  }

  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  if (remaining !== null && limit !== null) {
    const entity = entityFromPath(path);
    lastRateLimitReadings.set(entity, { remaining: Number(remaining), limit: Number(limit) });
    console.log(`  [sportmonks] ${path} — kvar denna timme (${entity}): ${remaining}/${limit}`);
    if (Number(remaining) <= 10) {
      throw new SportmonksError(
        `Sportmonks-timkvoten för "${entity}" är nästan slut (${remaining} kvar) — avbryter för att inte gå över.`
      );
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw new SportmonksError(`Sportmonks svarade HTTP ${response.status}: ${body.slice(0, 300)}`, response.status);
  }

  const json = (await response.json()) as RawResponse<T>;
  return { data: json.data, message: json.message, pagination: json.pagination };
}

/**
 * /v3/core/types stödjer INTE `per_page` (bekräftat: alltid 25/sida oavsett
 * begärt värde) — paginerar manuellt via `page`. Egen entitet ("core") i
 * kvothänseende, separat budget från fixtures/lag/spelare.
 */
export async function sportmonksGetAllTypes<T>(maxPages = 60): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, pagination } = await sportmonksGet<T[]>("core/types", { page });
    all.push(...data);
    if (!pagination?.has_more) break;
  }
  return all;
}
