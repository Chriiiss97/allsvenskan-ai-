/**
 * Sökparametrarna för spelarlistorna (/spelare och /scout/spelare) —
 * definierade i en egen, ramverksfri modul (2026-08-23) så att BÅDA sidorna
 * kan läsa dem på servern och components/data/PlayerExplorer.tsx kan
 * använda exakt samma typer i webbläsaren. Enda källan till vad en giltig
 * sortering/position är; sidorna gissar inte var för sig.
 *
 * Bara den DIREKTFILTRERADE delen bor här. Säsong, jämförelsesäsong och
 * "konsekvent bra" är serverstyrda (de kräver data som inte finns i den
 * skickade spelarmängden) och läses direkt av respektive page.tsx.
 */

export const EXPLORER_SORT_KEYS = [
  "rating",
  "goals",
  "assists",
  "goalsPer90",
  "minutes",
  "appearances",
  "age",
  "name",
  "ovrDelta",
  "consistency",
] as const;

export type ExplorerSortKey = (typeof EXPLORER_SORT_KEYS)[number];

export const EXPLORER_POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;

export type ExplorerPosition = (typeof EXPLORER_POSITIONS)[number];

/**
 * Alla direktfiltrerade fält som strängar — samma form som `<input>`/
 * `<select>` faktiskt håller, så inget värde behöver konverteras fram och
 * tillbaka mellan URL, formulärfält och filtrering. Tom sträng = av.
 */
export interface ExplorerFilters {
  q: string;
  /** Klubbens external_id (api-football) som sträng, "" = alla. */
  team: string;
  position: string;
  ageMin: string;
  ageMax: string;
  goalsMin: string;
  assistsMin: string;
  minutesMin: string;
  ratingMin: string;
  ratingMax: string;
  ovrDeltaMin: string;
  ovrDeltaMax: string;
  archetypes: string[];
  sort: ExplorerSortKey;
  dir: "asc" | "desc";
}

export const EMPTY_EXPLORER_FILTERS: ExplorerFilters = {
  q: "",
  team: "",
  position: "",
  ageMin: "",
  ageMax: "",
  goalsMin: "",
  assistsMin: "",
  minutesMin: "",
  ratingMin: "",
  ratingMax: "",
  ovrDeltaMin: "",
  ovrDeltaMax: "",
  archetypes: [],
  sort: "rating",
  dir: "desc",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Bara siffror (ev. med minustecken) släpps igenom — ett skräpvärde i URL:en ska bli "av", inte NaN. */
function numeric(value: string | string[] | undefined): string {
  const raw = first(value).trim();
  return /^-?\d+$/.test(raw) ? raw : "";
}

export function parseExplorerFilters(sp: RawSearchParams, options: { defaultSort?: ExplorerSortKey } = {}): ExplorerFilters {
  const sortRaw = first(sp.sort) as ExplorerSortKey;
  const positionRaw = first(sp.position) as ExplorerPosition;
  const archetypeRaw = sp.archetype;

  return {
    q: first(sp.q),
    team: numeric(sp.team),
    position: EXPLORER_POSITIONS.includes(positionRaw) ? positionRaw : "",
    ageMin: numeric(sp.ageMin),
    ageMax: numeric(sp.ageMax),
    goalsMin: numeric(sp.goalsMin),
    assistsMin: numeric(sp.assistsMin),
    minutesMin: numeric(sp.minutesMin),
    ratingMin: numeric(sp.ratingMin),
    ratingMax: numeric(sp.ratingMax),
    ovrDeltaMin: numeric(sp.ovrDeltaMin),
    ovrDeltaMax: numeric(sp.ovrDeltaMax),
    archetypes: archetypeRaw ? (Array.isArray(archetypeRaw) ? archetypeRaw : [archetypeRaw]) : [],
    sort: EXPLORER_SORT_KEYS.includes(sortRaw) ? sortRaw : options.defaultSort ?? "rating",
    dir: first(sp.dir) === "asc" ? "asc" : "desc",
  };
}
