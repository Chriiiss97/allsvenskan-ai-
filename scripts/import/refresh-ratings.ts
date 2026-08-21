import { createAdminClient } from "./admin-client";
import { computeSeasonRatings } from "../../lib/football/rating/compute-rating";
import { computeSeasonGoalkeeperRatings } from "../../lib/football/rating/goalkeeper-rating";
import { aggregatePlayerSeasonStats, type PlayerSeasonAggregate } from "../../lib/football/rating/rating-aggregates";
import { getPositionGroup, selectPeers } from "../../lib/football/position-group";
import { computeScoutOnlyMetrics } from "../../lib/football/rating/scout-metrics";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Facit-skrivaren till player_season_rating (se migration
 * 20260821120000_player_season_rating.sql + 20260821130000_..._metrics.sql)
 * — INTE ny beräkningslogik för OVR/kategorier. Återanvänder
 * computeSeasonRatings/computeSeasonGoalkeeperRatings rakt av (samma redan
 * hand-verifierade funktioner Scout/Topplistan/profilsidan använder) och
 * SPARAR nu även de mellansteg (kategori-poäng, per-mått percentil+råvärde)
 * de redan räknar ut internt men tidigare kastade bort. Scout Engine
 * (2026-08-21, Fas 2): gör detta så Scout/arketyper/percentilfilter kan
 * LÄSA istället för att räkna om hela ligan vid varje förfrågan.
 *
 * dribblesPastPer90 (scout-metrics.ts) räknas HÄR, separat från
 * computeSeasonRatings — den påverkar INTE OVR, så peer-poolen byggs en
 * gång till lokalt (samma getPositionGroup/selectPeers-mönster som
 * compute-rating.ts redan använder internt) istället för att ändra
 * OVR-beräkningens egna, redan verifierade kod.
 *
 * Två anropssätt:
 * - refreshRatingsForSeason: EN säsong, snabbt (~5-10s) — det som ska köras
 *   efter varje dags avslutade matcher (kopplas in i finalize-cronen).
 *   Historiska säsonger ändras aldrig efter att de är facitställda, så bara
 *   DEN AKTUELLA säsongen behöver periodisk uppdatering.
 * - refreshAllSeasonRatings: ALLA säsonger, en engångs-backfill (körs
 *   manuellt lokalt via `npm run import ratings`, inte tidsbegränsad av en
 *   serverless-timeout som cronen är).
 */
function toPeerShape(agg: PlayerSeasonAggregate): PlayerSeasonAggregate & { minutes_played: number } {
  return { ...agg, minutes_played: agg.minutesPlayed };
}

export async function refreshRatingsForSeason(supabase: Supabase, params: { seasonId: number; seasonYear: number }): Promise<number> {
  const [outfield, goalkeepers, aggregates] = await Promise.all([
    computeSeasonRatings(supabase, { season: params.seasonYear }),
    computeSeasonGoalkeeperRatings(supabase, { season: params.seasonYear }),
    aggregatePlayerSeasonStats(supabase, { seasonId: params.seasonId }),
  ]);
  const allPlayers = [...aggregates.values()];

  /** Fristående Scout-mått (t.ex. dribblesPastPer90) — samma peer-urval som Rating, men beräknat separat så OVR aldrig rörs. */
  function scoutMetricsFor(agg: PlayerSeasonAggregate): Record<string, { value: number; percentile: number }> {
    const positionGroupInfo = getPositionGroup(agg.position);
    if (!positionGroupInfo) return {};
    const samePositionOthers = allPlayers.filter(
      (p) => p.playerId !== agg.playerId && getPositionGroup(p.position)?.group === positionGroupInfo.group
    );
    const { peers } = selectPeers(samePositionOthers.map(toPeerShape), positionGroupInfo.label, agg.minutesPlayed);
    return computeScoutOnlyMetrics(agg, peers);
  }

  type UpsertRow = {
    player_id: number;
    season_id: number;
    position_group: "goalkeeper" | "defender" | "midfielder" | "attacker";
    ovr: number | null;
    confidence_tier: "hög" | "medel" | "låg" | null;
    own_minutes: number;
    computed_at: string;
    category_scores: Record<string, number> | null;
    metric_values: Record<string, { value: number; percentile: number; peerAverage: number }> | null;
    peer_count: number | null;
  };
  const now = new Date().toISOString();
  const rows: UpsertRow[] = [];

  for (const [playerId, r] of outfield) {
    if (!r.available || !r.positionGroup || !r.categories) continue; // t.ex. okänd position — inget rimligt facit att skriva
    const categoryScores: Record<string, number> = {};
    const metricValues: Record<string, { value: number; percentile: number; peerAverage: number }> = {};
    for (const [categoryKey, category] of Object.entries(r.categories)) {
      if (category.score !== null) categoryScores[categoryKey] = category.score;
      for (const m of category.metrics) metricValues[m.key] = { value: m.playerValue, percentile: m.percentile, peerAverage: m.peerAverage };
    }
    const agg = aggregates.get(playerId);
    if (agg) {
      // Scout-mått (t.ex. dribblesPastPer90) har ingen peerAverage i
      // sitt eget returformat — 0 här är ofarligt, "varför X?"-vyn
      // visar bara Scout-motorns egna mått (categories.ts:s 14),
      // aldrig scout-metrics.ts:s fristående mått.
      for (const [key, v] of Object.entries(scoutMetricsFor(agg))) metricValues[key] = { ...v, peerAverage: 0 };
    }

    rows.push({
      player_id: playerId,
      season_id: params.seasonId,
      position_group: r.positionGroup,
      ovr: r.ovr,
      confidence_tier: r.confidence?.tier ?? null,
      own_minutes: r.confidence?.ownMinutes ?? 0,
      computed_at: now,
      category_scores: categoryScores,
      metric_values: metricValues,
      peer_count: r.confidence?.peerCount ?? null,
    });
  }
  for (const [playerId, r] of goalkeepers) {
    if (!r.available) continue;
    const metricValues: Record<string, { value: number; percentile: number; peerAverage: number }> = {};
    for (const m of r.metrics) metricValues[m.key] = { value: m.playerValue, percentile: m.percentile, peerAverage: m.peerAverage };
    const agg = aggregates.get(playerId);
    if (agg) {
      for (const [key, v] of Object.entries(scoutMetricsFor(agg))) metricValues[key] = { ...v, peerAverage: 0 };
    }

    rows.push({
      player_id: playerId,
      season_id: params.seasonId,
      position_group: "goalkeeper",
      ovr: r.ovr,
      confidence_tier: r.confidence?.tier ?? null,
      own_minutes: r.confidence?.ownMinutes ?? 0,
      computed_at: now,
      category_scores: null,
      metric_values: metricValues,
      peer_count: r.confidence?.peerCount ?? null,
    });
  }

  // Batchad upsert — samma "inte en fråga per rad"-disciplin som resten av
  // importlagret (t.ex. finalize-match.ts:s event-chunkning).
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("player_season_rating").upsert(chunk, { onConflict: "player_id,season_id" });
    if (error) throw error;
    written += chunk.length;
  }
  return written;
}

export async function refreshAllSeasonRatings(supabase: Supabase = createAdminClient()): Promise<void> {
  const { data: seasons, error } = await supabase.from("season").select("id, year").order("year", { ascending: false });
  if (error) throw error;

  for (const s of seasons ?? []) {
    console.log(`Räknar rating för säsong ${s.year}...`);
    const written = await refreshRatingsForSeason(supabase, { seasonId: s.id, seasonYear: s.year });
    console.log(`  ${written} spelarrader skrivna för ${s.year}.`);
  }
}
