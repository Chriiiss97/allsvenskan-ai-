/**
 * OVR v2 — läsvägen mot player_ratings.
 * =============================================================================
 * ENDA källan till OVR i applikationen. Ersätter lib/football/scout/
 * rating-store.ts och stored-rating-view.ts, som läste den gamla
 * player_season_rating-tabellen.
 *
 * Beräknar ingenting. Betygen skrivs av scripts/import/refresh-ovr.ts och läses
 * här — det finns med flit ingen live-beräkningsväg som reserv. Den gamla
 * motorn hade två vägar till samma tal (sparat facit plus en live-beräkning som
 * föll in när facit saknades), och då går det inte längre att svara på vilken
 * siffra användaren faktiskt såg. Saknas en rad returneras null och anroparen
 * visar "ej tillgängligt".
 *
 * -----------------------------------------------------------------------------
 * KONFIDENS ÄR INTE VALFRI
 * -----------------------------------------------------------------------------
 * Varje betyg som lämnar det här lagret bär med sig sin konfidens, sina minuter
 * och hur stor del av talet som kommer från historik. Det är avsiktligt inte
 * möjligt att hämta ett naket OVR härifrån.
 *
 * Skälet är konkret: motorn ger en anfallare med 20 spelade minuter och stark
 * historik 82,8 i OVR. Det är rätt svar på frågan "hur bra är han?" — men ett
 * gravt missvisande svar på frågan "vad har han presterat i år", och utan
 * kontext läser varje användare det som det senare. Se displayHint() nedan.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ConfidenceTier, PositionGroup, SubscoreKey } from "./config";
import { POSITION_GROUP_LABELS } from "./config";

type Supabase = SupabaseClient<Database>;

// =============================================================================
// Typer
// =============================================================================

export interface PlayerOvr {
  playerId: number;
  seasonId: number;
  seasonYear: number;
  clubId: number | null;
  positionGroup: PositionGroup;
  secondaryPositionGroup: PositionGroup | null;
  positionConfidence: number;

  ovr: number | null;
  /** Enbart innevarande säsong, utan shrinkage. */
  currentSeasonRating: number | null;
  /** Enbart historiken — vad vi trodde innan säsongen. */
  historicalRating: number | null;
  /** Ren åldersprojektion mot 27 år. INTE en scoutbedömning. */
  potential: number | null;
  /** -10..+10, senaste matcherna i nuvarande klubb. Helt separat från ovr. */
  form: number;

  confidence: number;
  confidenceTier: ConfidenceTier | null;
  /** Andel av betyget som kommer från historik i stället för årets spel. */
  priorWeight: number;

  minutesPlayed: number;
  /** Minuter samma säsong utanför Allsvenskan som räknats in. */
  externalMinutes: number;
  /** Känd speltid vi inte kunnat värdera (cup, träningsmatch, liga utan koefficient). */
  unratedMinutes: number;

  subscores: Record<SubscoreKey, number | null>;
  configVersion: string;
}

const SELECT_COLUMNS =
  "player_id, season_id, season_year, club_id, position_group, secondary_position_group, position_confidence, " +
  "ovr, current_season_rating, historical_rating, potential, form, confidence, confidence_tier, prior_weight, " +
  "minutes_played, external_minutes, unrated_minutes, " +
  "subscore_finishing, subscore_passing, subscore_dribbling, subscore_defending, subscore_duels, subscore_goalkeeping, " +
  "config_version";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlayerOvr(row: any): PlayerOvr {
  return {
    playerId: row.player_id,
    seasonId: row.season_id,
    seasonYear: row.season_year,
    clubId: row.club_id,
    positionGroup: row.position_group,
    secondaryPositionGroup: row.secondary_position_group,
    positionConfidence: Number(row.position_confidence ?? 0),
    ovr: row.ovr === null ? null : Number(row.ovr),
    currentSeasonRating: row.current_season_rating === null ? null : Number(row.current_season_rating),
    historicalRating: row.historical_rating === null ? null : Number(row.historical_rating),
    potential: row.potential === null ? null : Number(row.potential),
    form: Number(row.form ?? 0),
    confidence: Number(row.confidence ?? 0),
    confidenceTier: row.confidence_tier,
    priorWeight: Number(row.prior_weight ?? 0),
    minutesPlayed: row.minutes_played ?? 0,
    externalMinutes: row.external_minutes ?? 0,
    unratedMinutes: row.unrated_minutes ?? 0,
    subscores: {
      finishing: row.subscore_finishing === null ? null : Number(row.subscore_finishing),
      passing: row.subscore_passing === null ? null : Number(row.subscore_passing),
      dribbling: row.subscore_dribbling === null ? null : Number(row.subscore_dribbling),
      defending: row.subscore_defending === null ? null : Number(row.subscore_defending),
      duels: row.subscore_duels === null ? null : Number(row.subscore_duels),
      goalkeeping: row.subscore_goalkeeping === null ? null : Number(row.subscore_goalkeeping),
    },
    configVersion: row.config_version,
  };
}

// =============================================================================
// Presentationskontraktet
// =============================================================================

/**
 * Minsta speltid för att ingå i en LISTA som standard.
 *
 * Gäller rankinglistor, Scout-listor och topplistor — inte spelarprofilen, där
 * användaren uttryckligen bett om just den spelaren och ska få se hans betyg
 * oavsett speltid.
 *
 * Utan gränsen toppas varje lista av spelare med 20 minuters speltid och stark
 * historik, eftersom deras betyg är korrekt men handlar om något annat än vad
 * en topplista påstår sig visa. Gränsen ska gå att stänga av i UI:t — den är en
 * standardinställning, inte en censur.
 */
export const DEFAULT_LIST_MIN_MINUTES = 450;

/** Över den här andelen historik får betyget inte visas utan en förklarande rad. */
export const PRIOR_WEIGHT_EXPLAIN_THRESHOLD = 0.5;

export interface OvrDisplayHint {
  /** Kort etikett bredvid betyget, t.ex. "låg · 235 min". */
  badge: string;
  /** Full mening när betyget till stor del vilar på historik. null när det inte behövs. */
  caveat: string | null;
  /** true när UI:t bör dämpa eller varningsmarkera talet. */
  needsCaveat: boolean;
}

/**
 * Hur ett betyg ska presenteras, givet hur väl underbyggt det är.
 *
 * Bor här och inte i en komponent, så att spelarprofilen, Scout-kortet,
 * topplistan och chatboten säger samma sak om samma spelare. En 82:a med 20
 * minuters speltid ska inte kunna se annorlunda ut beroende på vilken yta man
 * råkar titta på.
 */
export function displayHint(rating: PlayerOvr): OvrDisplayHint {
  const tier = rating.confidenceTier ?? "låg";
  const minutes = rating.minutesPlayed + rating.externalMinutes;
  const badge = `${tier} · ${minutes} min`;

  const parts: string[] = [];
  if (rating.priorWeight >= PRIOR_WEIGHT_EXPLAIN_THRESHOLD) {
    parts.push(
      `Betyget vilar till ${Math.round(rating.priorWeight * 100)} % på tidigare säsonger — spelaren har ${minutes} minuter i år.`
    );
  }
  if (rating.externalMinutes > 0) {
    parts.push(`${rating.externalMinutes} av minuterna är spelade utanför Allsvenskan och nivåjusterade.`);
  }
  if (rating.unratedMinutes > 0) {
    parts.push(
      `${rating.unratedMinutes} minuter i cupspel eller ligor utan verifierad nivå kunde inte vägas in.`
    );
  }
  if (rating.positionConfidence === 0) {
    parts.push("Positionen är gissad ur spelarens registrerade position — han har inte startat en match i mätfönstret.");
  }

  return {
    badge,
    caveat: parts.length > 0 ? parts.join(" ") : null,
    needsCaveat: parts.length > 0 || tier === "låg",
  };
}

/** Svensk etikett för positionsgruppen, t.ex. "ytterbackar". */
export function positionGroupLabel(group: PositionGroup): string {
  return POSITION_GROUP_LABELS[group];
}

// =============================================================================
// Läsfunktioner
// =============================================================================

/**
 * Alla betyg för en säsong. Returnerar en tom lista om säsongen inte är
 * beräknad — anroparen skiljer på det via `.length === 0` och visar
 * "ej tillgängligt" hellre än en tom topplista utan förklaring.
 */
export async function getSeasonRatings(
  supabase: Supabase,
  seasonId: number,
  options: { minMinutes?: number } = {}
): Promise<PlayerOvr[]> {
  let query = supabase.from("player_ratings").select(SELECT_COLUMNS).eq("season_id", seasonId);
  if (options.minMinutes !== undefined) query = query.gte("minutes_played", options.minMinutes);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPlayerOvr);
}

/** Snabb uppslagskarta player_id -> OVR för en säsong. */
export async function getSeasonOvrMap(supabase: Supabase, seasonId: number): Promise<Map<number, number | null>> {
  const { data, error } = await supabase.from("player_ratings").select("player_id, ovr").eq("season_id", seasonId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.player_id, r.ovr === null ? null : Number(r.ovr)]));
}

/** Ett enskilt betyg. null när spelaren saknar rad för säsongen. */
export async function getPlayerOvr(
  supabase: Supabase,
  params: { playerId: number; seasonId: number }
): Promise<PlayerOvr | null> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select(SELECT_COLUMNS)
    .eq("player_id", params.playerId)
    .eq("season_id", params.seasonId)
    .maybeSingle();
  if (error) throw error;
  return data ? toPlayerOvr(data) : null;
}

/**
 * Hela nedbrytningen för ett betyg — percentil per mätvärde, historikens
 * bidrag per säsong och liga, och vilken speltid som inte kunnat värderas.
 *
 * Egen funktion, inte en del av getPlayerOvr: historical_evidence är en stor
 * jsonb-klump som bara "varför det här betyget?"-vyn behöver. Att alltid dra
 * med den i varje listfråga vore slöseri.
 */
export interface OvrBreakdown {
  coverage: number;
  joinedClubDate: string | null;
  metrics: {
    metric: string;
    label: string;
    weight: number;
    rawValue: number | null;
    observedPercentile: number | null;
    priorPercentile: number | null;
    adjustedPercentile: number | null;
    k: number;
    priorShare: number;
    minutes: number;
  }[];
  contributions: {
    seasonYear: number;
    source: "allsvenskan" | "foreign";
    leagueName?: string;
    leagueCoefficient: number;
    minutes: number;
    weight: number;
    metrics: string[];
  }[];
  currentSeasonExternal: {
    leagueName: string;
    leagueExternalId: number;
    leagueCoefficient: number;
    minutes: number;
    metrics: string[];
  }[];
  unratedLeagues: {
    leagueName: string;
    leagueExternalId: number;
    seasonYear: number;
    minutes: number;
    reason: string;
  }[];
}

export async function getOvrBreakdown(
  supabase: Supabase,
  params: { playerId: number; seasonId: number }
): Promise<OvrBreakdown | null> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select("historical_evidence")
    .eq("player_id", params.playerId)
    .eq("season_id", params.seasonId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.historical_evidence) return null;

  // historical_evidence lagras med snake_case på toppnivå (så den läser likadant
  // som resten av tabellen i en SQL-konsol) men camelCase inuti objekten, som
  // kommer direkt från beräkningslagrets typer. Översättningen sker här, en
  // gång, i stället för i varje konsument.
  const evidence = data.historical_evidence as {
    coverage?: number;
    joined_club_date?: string | null;
    metrics?: OvrBreakdown["metrics"];
    contributions?: OvrBreakdown["contributions"];
    current_season_external?: OvrBreakdown["currentSeasonExternal"];
    unrated_leagues?: OvrBreakdown["unratedLeagues"];
  };
  return {
    coverage: evidence.coverage ?? 0,
    joinedClubDate: evidence.joined_club_date ?? null,
    metrics: evidence.metrics ?? [],
    contributions: evidence.contributions ?? [],
    currentSeasonExternal: evidence.current_season_external ?? [],
    unratedLeagues: evidence.unrated_leagues ?? [],
  };
}

export interface OvrHistoryPoint {
  seasonId: number;
  seasonYear: number;
  positionGroup: PositionGroup;
  ovr: number | null;
  currentSeasonRating: number | null;
  historicalRating: number | null;
  confidenceTier: ConfidenceTier | null;
  minutesPlayed: number;
  externalMinutes: number;
  clubId: number | null;
}

/**
 * En spelares hela OVR-historik i stigande årsordning — grunden för
 * utvecklingskurvan på profilsidan. En indexerad fråga, ingen beräkning.
 */
export async function getPlayerOvrHistory(supabase: Supabase, playerId: number): Promise<OvrHistoryPoint[]> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select(
      "season_id, season_year, position_group, ovr, current_season_rating, historical_rating, confidence_tier, minutes_played, external_minutes, club_id"
    )
    .eq("player_id", playerId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      seasonId: r.season_id,
      seasonYear: r.season_year,
      positionGroup: r.position_group as PositionGroup,
      ovr: r.ovr === null ? null : Number(r.ovr),
      currentSeasonRating: r.current_season_rating === null ? null : Number(r.current_season_rating),
      historicalRating: r.historical_rating === null ? null : Number(r.historical_rating),
      confidenceTier: r.confidence_tier as ConfidenceTier | null,
      minutesPlayed: r.minutes_played ?? 0,
      externalMinutes: r.external_minutes ?? 0,
      clubId: r.club_id,
    }))
    .sort((a, b) => a.seasonYear - b.seasonYear);
}

export interface OvrTrendEntry {
  playerId: number;
  positionGroup: PositionGroup;
  ovrA: number;
  ovrB: number;
  delta: number;
  confidenceTierA: ConfidenceTier | null;
  confidenceTierB: ConfidenceTier | null;
  minutesA: number;
  minutesB: number;
}

/**
 * Ligabred jämförelse mellan två säsonger (A tidigare, B senare) — "mest
 * förbättrad/försämrad".
 *
 * Bara spelare med ett giltigt OVR i BÅDA säsongerna OCH samma positionsgrupp
 * räknas. En spelare som gått från ytterback till mittfältare bedöms mot en
 * annan vikttabell, och deltat vore inte ett uttalande om utveckling.
 *
 * Kräver också minst minMinutes i båda säsongerna: annars domineras listan av
 * spelare vars betyg mest är shrinkage, där "förbättringen" är att de fick fler
 * matcher, inte att de blev bättre.
 */
export async function getOvrTrend(
  supabase: Supabase,
  params: { seasonIdA: number; seasonIdB: number; minMinutes?: number }
): Promise<OvrTrendEntry[]> {
  const minMinutes = params.minMinutes ?? DEFAULT_LIST_MIN_MINUTES;
  const [rowsA, rowsB] = await Promise.all([
    getSeasonRatings(supabase, params.seasonIdA, { minMinutes }),
    getSeasonRatings(supabase, params.seasonIdB, { minMinutes }),
  ]);

  const byPlayerA = new Map(rowsA.map((r) => [r.playerId, r]));
  const entries: OvrTrendEntry[] = [];
  for (const b of rowsB) {
    if (b.ovr === null) continue;
    const a = byPlayerA.get(b.playerId);
    if (!a || a.ovr === null) continue;
    if (a.positionGroup !== b.positionGroup) continue;
    entries.push({
      playerId: b.playerId,
      positionGroup: b.positionGroup,
      ovrA: a.ovr,
      ovrB: b.ovr,
      delta: Math.round((b.ovr - a.ovr) * 10) / 10,
      confidenceTierA: a.confidenceTier,
      confidenceTierB: b.confidenceTier,
      minutesA: a.minutesPlayed,
      minutesB: b.minutesPlayed,
    });
  }
  return entries;
}

export interface CareerConsistency {
  playerId: number;
  seasonsPlayed: number;
  averageOvr: number;
  seasonsAboveThreshold: number;
  peakOvr: number;
  peakSeasonYear: number;
}

/**
 * "Konsekvent bra" över karriären. Läser hela player_ratings sidnumrerat —
 * tabellen är långt över Supabases 1 000-radstak.
 *
 * Kräver minst medelkonfidens per säsong. Utan det kunde en enda 90-minuters
 * säsong där betyget nästan helt är historik räknas som ett självständigt
 * bevis för att spelaren höll den nivån — vilket är att räkna samma historik
 * två gånger.
 */
export async function getCareerConsistencyMap(
  supabase: Supabase,
  thresholdOvr = 70
): Promise<Map<number, CareerConsistency>> {
  type Row = {
    player_id: number;
    season_year: number;
    ovr: number | null;
    confidence_tier: ConfidenceTier | null;
  };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("player_ratings")
      .select("player_id, season_year, ovr, confidence_tier")
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const byPlayer = new Map<number, { sum: number; count: number; above: number; peak: number; peakYear: number }>();
  for (const r of rows) {
    if (r.ovr === null || r.confidence_tier === "låg" || r.confidence_tier === null) continue;
    const ovr = Number(r.ovr);
    const entry = byPlayer.get(r.player_id) ?? { sum: 0, count: 0, above: 0, peak: 0, peakYear: 0 };
    entry.sum += ovr;
    entry.count += 1;
    if (ovr >= thresholdOvr) entry.above += 1;
    if (ovr > entry.peak) {
      entry.peak = ovr;
      entry.peakYear = r.season_year;
    }
    byPlayer.set(r.player_id, entry);
  }

  const result = new Map<number, CareerConsistency>();
  for (const [playerId, e] of byPlayer) {
    result.set(playerId, {
      playerId,
      seasonsPlayed: e.count,
      averageOvr: Math.round((e.sum / e.count) * 10) / 10,
      seasonsAboveThreshold: e.above,
      peakOvr: e.peak,
      peakSeasonYear: e.peakYear,
    });
  }
  return result;
}
