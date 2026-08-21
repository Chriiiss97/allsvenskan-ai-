import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ConfidenceTier } from "../confidence";
import type { PositionGroupKey } from "../position-group";

type Supabase = SupabaseClient<Database>;

/**
 * Läsvägen mot player_season_rating (se migration
 * 20260821120000_player_season_rating.sql) — facit skrivet av
 * scripts/import/refresh-ratings.ts, inte beräknat här. Delad av BÅDA de
 * nya funktionerna (spelarens OVR-historik och den ligabreda "mest
 * förbättrad/försämrad"-jämförelsen) enligt uttrycklig instruktion: ett
 * system, inte två.
 *
 * Skriver INTE hit — bara läser. Om tabellen är tom för en säsong (t.ex.
 * innan `npm run import ratings` körts första gången) faller anroparna
 * tillbaka på den redan verifierade live-beräkningen (se
 * computeSeasonOvrMap i compute-rating.ts) — aldrig en tyst tom lista.
 */

export interface StoredMetricValue {
  value: number;
  percentile: number;
}

export interface StoredSeasonRating {
  playerId: number;
  positionGroup: PositionGroupKey;
  ovr: number | null;
  confidenceTier: ConfidenceTier | null;
  ownMinutes: number;
  /** Scout Engine Fas 2 — shooting/passing/dribbling/defending, null för målvakter. */
  categoryScores: Record<string, number> | null;
  /** Scout Engine Fas 2 — per mått: {value, percentile}. Grunden för arketyper/percentilfilter. */
  metricValues: Record<string, StoredMetricValue> | null;
}

/**
 * En säsongs facit, en enda indexerad fråga. Returnerar `null` (inte en tom
 * Map) om tabellen inte har NÅGON rad för säsongen — skiljer "inte
 * backfillad än" från "backfillad men ingen spelare kvalificerade sig".
 */
export async function getStoredSeasonRatings(supabase: Supabase, seasonId: number): Promise<StoredSeasonRating[] | null> {
  const { data, error } = await supabase
    .from("player_season_rating")
    .select("player_id, position_group, ovr, confidence_tier, own_minutes, category_scores, metric_values")
    .eq("season_id", seasonId);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data.map((r) => ({
    playerId: r.player_id,
    positionGroup: r.position_group,
    ovr: r.ovr,
    confidenceTier: r.confidence_tier,
    ownMinutes: r.own_minutes,
    categoryScores: r.category_scores,
    metricValues: r.metric_values,
  }));
}

/** Samma data som ovan, formad som den enkla OVR-slagkarta computeSeasonOvrMap redan returnerar. */
export async function getStoredSeasonOvrMap(supabase: Supabase, seasonId: number): Promise<Map<number, number | null> | null> {
  const rows = await getStoredSeasonRatings(supabase, seasonId);
  if (rows === null) return null;
  return new Map(rows.map((r) => [r.playerId, r.ovr]));
}

export interface SeasonRatingPoint {
  seasonId: number;
  seasonYear: number;
  positionGroup: PositionGroupKey;
  ovr: number | null;
  confidenceTier: ConfidenceTier | null;
  ownMinutes: number;
}

/**
 * En spelares hela sparade OVR-historik, en enda indexerad fråga (ingen
 * live-beräkning) — stigande årsordning för direkt användning i en
 * utvecklingskurva. Kräver att player_season_rating faktiskt är backfillad
 * för de säsonger spelaren var aktiv i, annars returneras bara de säsonger
 * som finns skrivna (tomt = "ännu ej backfillat", inte "ingen historik finns").
 */
export async function getPlayerRatingHistory(supabase: Supabase, playerId: number): Promise<SeasonRatingPoint[]> {
  const { data, error } = await supabase
    .from("player_season_rating")
    .select("position_group, ovr, confidence_tier, own_minutes, season:season_id(id, year)")
    .eq("player_id", playerId)
    .returns<
      {
        position_group: PositionGroupKey;
        ovr: number | null;
        confidence_tier: ConfidenceTier | null;
        own_minutes: number;
        season: { id: number; year: number } | null;
      }[]
    >();
  if (error) throw error;

  return (data ?? [])
    .filter((r): r is typeof r & { season: { id: number; year: number } } => r.season !== null)
    .map((r) => ({
      seasonId: r.season.id,
      seasonYear: r.season.year,
      positionGroup: r.position_group,
      ovr: r.ovr,
      confidenceTier: r.confidence_tier,
      ownMinutes: r.own_minutes,
    }))
    .sort((a, b) => a.seasonYear - b.seasonYear);
}

export interface RatingTrendEntry {
  playerId: number;
  positionGroup: PositionGroupKey;
  ovrA: number;
  ovrB: number;
  delta: number;
  confidenceTierA: ConfidenceTier | null;
  confidenceTierB: ConfidenceTier | null;
  ownMinutesA: number;
  ownMinutesB: number;
}

/**
 * Ligabred jämförelse mellan två säsonger (A=tidigare, B=senare) — grunden
 * för "mest förbättrad/försämrad". Två indexerade frågor + en join i JS,
 * INGEN live-beräkning. Bara spelare med ett GILTIGT OVR i BÅDA säsongerna
 * räknas med — annars vore "förbättring" en gissning om en spelare som
 * bytte position eller inte hade tillräckligt underlag ena säsongen.
 * Returnerar `null` om NÅGON av de två säsongerna helt saknar facit.
 */
export async function getRatingTrendComparison(
  supabase: Supabase,
  params: { seasonIdA: number; seasonIdB: number }
): Promise<RatingTrendEntry[] | null> {
  const [rowsA, rowsB] = await Promise.all([
    getStoredSeasonRatings(supabase, params.seasonIdA),
    getStoredSeasonRatings(supabase, params.seasonIdB),
  ]);
  if (rowsA === null || rowsB === null) return null;

  const byPlayerA = new Map(rowsA.map((r) => [r.playerId, r]));
  const entries: RatingTrendEntry[] = [];
  for (const b of rowsB) {
    if (b.ovr === null) continue;
    const a = byPlayerA.get(b.playerId);
    if (!a || a.ovr === null) continue;
    // Samma positionsgrupp i båda säsongerna — en spelare som gått från
    // mittfältare till anfallare jämförs mot olika viktkonfigurationer
    // (se position-rating-config.ts) och deltat vore inte meningsfullt.
    if (a.positionGroup !== b.positionGroup) continue;
    entries.push({
      playerId: b.playerId,
      positionGroup: b.positionGroup,
      ovrA: a.ovr,
      ovrB: b.ovr,
      delta: b.ovr - a.ovr,
      confidenceTierA: a.confidenceTier,
      confidenceTierB: b.confidenceTier,
      ownMinutesA: a.ownMinutes,
      ownMinutesB: b.ownMinutes,
    });
  }
  return entries;
}

export interface CareerConsistency {
  playerId: number;
  /** Antal säsonger med en giltig, minst "medel"-säker OVR — samma konfidensgolv som rating-trend.ts:s peak-logik, en flopp-säsong ska inte kunna räknas som en "bra säsong". */
  seasonsPlayed: number;
  /** Medel-OVR över de säsongerna. */
  averageOvr: number;
  /** Hur många av de säsongerna som klarade tröskeln (default 70). */
  seasonsAboveThreshold: number;
}

/**
 * "Konsekvent bra" — Scout Engine Fas 5 (historisk analys). Läser HELA
 * player_season_rating (alla 11 säsonger, ~4 659 rader just nu — långt
 * över Supabases 1000-radstak, sidnumrerad explicit, samma disciplin som
 * redan bevisad nödvändig flera gånger i det här projektet). En enda
 * fråga, oavsett hur många spelare Scout sedan filtrerar bland — inte en
 * fråga per spelare.
 *
 * Kräver minst "medel" konfidens per säsong (samma princip som
 * rating-trend.ts:s peak) — annars kunde en enda 200-minuters-flopp med
 * ett slumpmässigt högt tal dra upp både snittet och tröskel-räkningen.
 */
export async function getCareerConsistencyMap(supabase: Supabase, thresholdOvr = 70): Promise<Map<number, CareerConsistency>> {
  type Row = { player_id: number; ovr: number | null; confidence_tier: ConfidenceTier | null };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("player_season_rating")
      .select("player_id, ovr, confidence_tier")
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const byPlayer = new Map<number, { sum: number; count: number; above: number }>();
  for (const r of rows) {
    if (r.ovr === null || r.confidence_tier === "låg" || r.confidence_tier === null) continue;
    const entry = byPlayer.get(r.player_id) ?? { sum: 0, count: 0, above: 0 };
    entry.sum += r.ovr;
    entry.count += 1;
    if (r.ovr >= thresholdOvr) entry.above += 1;
    byPlayer.set(r.player_id, entry);
  }

  const result = new Map<number, CareerConsistency>();
  for (const [playerId, e] of byPlayer) {
    result.set(playerId, {
      playerId,
      seasonsPlayed: e.count,
      averageOvr: Math.round((e.sum / e.count) * 10) / 10,
      seasonsAboveThreshold: e.above,
    });
  }
  return result;
}
