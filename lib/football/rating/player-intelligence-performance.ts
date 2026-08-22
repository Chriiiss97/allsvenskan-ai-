import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { percentile, invertedPercentile } from "../percentile";
import { RATING_METRICS, type RatingCategoryKey } from "./metric-registry";
import { POSITION_RATING_CONFIG } from "./position-rating-config";
import { getPositionGroup, type PositionGroupKey } from "../position-group";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Player Intelligence Engine — match-nivå "Performance" (produktionsversion)
 * ============================================================================
 * Samma exakta metod som backtestad i scripts/research/
 * player-intelligence-backtest.ts:s computeMatchPerformances() — men körd
 * FÖR EN MATCH I TAGET (produktionens matchuppdateringspipeline hanterar en
 * ny match åt gången, inte en hel historisk sekvens). Återanvänder
 * metric-registry.ts/position-rating-config.ts/percentile.ts/
 * position-group.ts OFÖRÄNDRADE — bara läsning (import), exakt samma
 * princip som forskningen och som redan etablerad i ovr-proposal.ts.
 *
 * Peer-poolen är STRIKT KAUSAL: bara andra spelares kvalificerande matcher
 * (samma säsong, samma positionsgrupp, minst 30 spelade minuter) med
 * kickoff_at FÖRE den aktuella matchens datum. Matcher på EXAKT samma dag
 * ser inte varandra (samma regel som forskningen) — peer-poolen är "läget
 * vid dagens start", aldrig framåtblickande.
 */

const MIN_MATCH_MINUTES = 30;
const MIN_PEER_COUNT = 4;

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return (value / minutes) * 90;
}
function pctOf(num: number, den: number): number | null {
  if (den <= 0) return null;
  return (num / den) * 100;
}

interface StatRow {
  fixture_id: number;
  player_id: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  passes_total: number | null;
  passes_key: number | null;
  passes_accuracy: number | null;
  tackles_total: number | null;
  tackles_interceptions: number | null;
  duels_total: number | null;
  duels_won: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  saves: number | null;
  goals_conceded: number | null;
}

function extractMatchMetric(row: StatRow, key: string): number | null {
  const m = row.minutes_played ?? 0;
  switch (key) {
    case "goalsPer90": return per90(row.goals ?? 0, m);
    case "shotsTotalPer90": return per90(row.shots_total ?? 0, m);
    case "shotsOnTargetPer90": return per90(row.shots_on_target ?? 0, m);
    case "passesTotalPer90": return per90(row.passes_total ?? 0, m);
    case "passesAccuracyPct": return row.passes_accuracy;
    case "passesKeyPer90": return per90(row.passes_key ?? 0, m);
    case "assistsPer90": return per90(row.assists ?? 0, m);
    case "dribblesAttemptsPer90": return per90(row.dribbles_attempts ?? 0, m);
    case "dribblesSuccessPer90": return per90(row.dribbles_success ?? 0, m);
    case "dribblesSuccessPct": return pctOf(row.dribbles_success ?? 0, row.dribbles_attempts ?? 0);
    case "tacklesTotalPer90": return per90(row.tackles_total ?? 0, m);
    case "interceptionsPer90": return per90(row.tackles_interceptions ?? 0, m);
    case "duelsWonPer90": return per90(row.duels_won ?? 0, m);
    case "duelsWonPct": return pctOf(row.duels_won ?? 0, row.duels_total ?? 0);
    default: return null;
  }
}

const GK_METRIC_WEIGHTS = { savePct: 45, goalsConcededPer90: 35, cleanSheetPct: 20 } as const;
function extractGkMatchMetric(row: StatRow, key: keyof typeof GK_METRIC_WEIGHTS): number | null {
  const m = row.minutes_played ?? 0;
  switch (key) {
    case "savePct": {
      const denom = (row.saves ?? 0) + (row.goals_conceded ?? 0);
      return denom === 0 ? null : ((row.saves ?? 0) / denom) * 100;
    }
    case "goalsConcededPer90":
      return per90(row.goals_conceded ?? 0, m);
    case "cleanSheetPct":
      return m >= 60 ? ((row.goals_conceded ?? 0) === 0 ? 100 : 0) : null;
  }
}

const STAT_SELECT =
  "fixture_id, player_id, minutes_played, goals, assists, shots_total, shots_on_target, passes_total, passes_key, passes_accuracy, tackles_total, tackles_interceptions, duels_total, duels_won, dribbles_attempts, dribbles_success, saves, goals_conceded";

export interface MatchPerformanceResult {
  /** null om den kausala peer-poolen hade färre än 4 kvalificerande spelare — aldrig gissat fram. */
  performance: number | null;
  peerCount: number;
  minutesPlayed: number;
  positionGroup: PositionGroupKey;
  seasonId: number;
  kickoffAt: string;
}

/**
 * Beräknar Performance för EN spelares EN match. Returnerar null (inte ett
 * fel) om spelaren saknade kvalificerande speltid (<30 min) den matchen —
 * anroparen (matchuppdateringspipelinen) hoppar då bara över den matchen
 * för den spelaren, precis som forskningen redan gjorde.
 */
export async function computeMatchPerformance(
  supabase: Supabase,
  params: { fixtureId: number; playerId: number }
): Promise<MatchPerformanceResult | null> {
  const { data: fixture, error: fixtureError } = await supabase
    .from("fixture")
    .select("id, season_id, kickoff_at, status")
    .eq("id", params.fixtureId)
    .maybeSingle();
  if (fixtureError) throw fixtureError;
  if (!fixture || !["FT", "AET", "PEN"].includes(fixture.status)) return null;

  const { data: playerRow, error: playerError } = await supabase
    .from("player")
    .select("position")
    .eq("id", params.playerId)
    .maybeSingle();
  if (playerError) throw playerError;
  const positionGroupInfo = getPositionGroup(playerRow?.position ?? null);
  if (!positionGroupInfo) return null;

  const { data: ownStatRaw, error: ownStatError } = await supabase
    .from("fixture_player_stats")
    .select(STAT_SELECT)
    .eq("fixture_id", params.fixtureId)
    .eq("player_id", params.playerId)
    .maybeSingle();
  if (ownStatError) throw ownStatError;
  const ownStat = ownStatRaw as StatRow | null;
  if (!ownStat || (ownStat.minutes_played ?? 0) < MIN_MATCH_MINUTES) return null;

  // Kausal peer-pool: samma säsong+positionsgrupp, kickoff_at STRIKT FÖRE
  // den här matchens datum. Paginerad — kan i teorin överstiga 1000 rader
  // sent i en lång säsong (känd, tidigare dokumenterad Supabase-fallgrop).
  const { data: fixturesBefore, error: fixturesBeforeError } = await supabase
    .from("fixture")
    .select("id")
    .eq("season_id", fixture.season_id)
    .in("status", ["FT", "AET", "PEN"])
    .lt("kickoff_at", fixture.kickoff_at);
  if (fixturesBeforeError) throw fixturesBeforeError;
  const fixtureIdsBefore = (fixturesBefore ?? []).map((f) => f.id);

  const peerRows: StatRow[] = [];
  if (fixtureIdsBefore.length > 0) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("fixture_player_stats")
        .select(STAT_SELECT)
        .in("fixture_id", fixtureIdsBefore)
        .neq("player_id", params.playerId)
        .gte("minutes_played", MIN_MATCH_MINUTES)
        .range(from, from + PAGE - 1)
        .returns<StatRow[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      peerRows.push(...data);
      if (data.length < PAGE) break;
    }
  }

  // Positionsfiltrera peers — kräver spelarnas positioner. En fråga för
  // alla distinkta peer-spelare (paginerad — player-tabellen har 2305+
  // rader, samma kända fallgrop redan dokumenterad och fixad i
  // forskningsfasen).
  const peerPlayerIds = [...new Set(peerRows.map((r) => r.player_id).filter((id): id is number => id !== null))];
  const positionByPlayer = new Map<number, string | null>();
  if (peerPlayerIds.length > 0) {
    const PAGE = 1000;
    for (let from = 0; from < peerPlayerIds.length; from += PAGE) {
      const chunk = peerPlayerIds.slice(from, from + PAGE);
      const { data, error } = await supabase.from("player").select("id, position").in("id", chunk);
      if (error) throw error;
      for (const p of data ?? []) positionByPlayer.set(p.id, p.position);
    }
  }
  const samePositionPeers = peerRows.filter(
    (r) => r.player_id !== null && getPositionGroup(positionByPlayer.get(r.player_id) ?? null)?.group === positionGroupInfo.group
  );

  let performance: number | null = null;
  let peerCount = 0;

  if (positionGroupInfo.group === "goalkeeper") {
    const percentiles: number[] = [];
    for (const mKey of Object.keys(GK_METRIC_WEIGHTS) as (keyof typeof GK_METRIC_WEIGHTS)[]) {
      const val = extractGkMatchMetric(ownStat, mKey);
      if (val === null) continue;
      const peerValues = samePositionPeers.map((p) => extractGkMatchMetric(p, mKey)).filter((v): v is number => v !== null);
      if (peerValues.length < MIN_PEER_COUNT) continue;
      peerCount = Math.max(peerCount, peerValues.length);
      percentiles.push(mKey === "goalsConcededPer90" ? invertedPercentile(val, peerValues) : percentile(val, peerValues));
    }
    if (percentiles.length > 0) performance = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
  } else {
    const weights = POSITION_RATING_CONFIG[positionGroupInfo.group].weights;
    const catScores: Partial<Record<RatingCategoryKey, number>> = {};
    for (const catKey of Object.keys(weights) as RatingCategoryKey[]) {
      const metricsInCat = RATING_METRICS.filter((m) => m.category === catKey);
      const pcts: number[] = [];
      for (const metric of metricsInCat) {
        const val = extractMatchMetric(ownStat, metric.key);
        if (val === null) continue;
        const peerValues = samePositionPeers.map((p) => extractMatchMetric(p, metric.key)).filter((v): v is number => v !== null);
        if (peerValues.length < MIN_PEER_COUNT) continue;
        peerCount = Math.max(peerCount, peerValues.length);
        pcts.push(percentile(val, peerValues));
      }
      if (pcts.length > 0) catScores[catKey] = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    }
    const availableWeightSum = (Object.keys(catScores) as RatingCategoryKey[]).reduce((a, k) => a + weights[k], 0);
    if (availableWeightSum > 0) {
      let sum = 0;
      for (const k of Object.keys(catScores) as RatingCategoryKey[]) sum += (catScores[k]! * weights[k]) / availableWeightSum;
      performance = sum;
    }
  }

  return {
    performance,
    peerCount,
    minutesPlayed: ownStat.minutes_played ?? 0,
    positionGroup: positionGroupInfo.group,
    seasonId: fixture.season_id,
    kickoffAt: fixture.kickoff_at,
  };
}

// ---------------------------------------------------------------------------
// BULK-variant — för backfillen (scripts/import/run-player-intelligence-
// engine.ts), som annars skulle göra ~5–6 databasfrågor PER (spelare,match)-
// par (hundratusentals frågor över hela ligans historik). Exakt samma
// matematik/regler som computeMatchPerformance ovan (samma extractMatchMetric/
// extractGkMatchMetric, samma MIN_MATCH_MINUTES/MIN_PEER_COUNT, samma kausala
// "bara tidigare kickoff_at"-peer-pool) — bara data laddad EN gång och
// bearbetad i minnet, samma bulk-mönster som redan bevisat snabbt i
// scripts/research/player-intelligence-backtest.ts. Enda källan till sanning
// för SJÄLVA FORMELN är fortfarande extractMatchMetric/extractGkMatchMetric
// ovan — den här funktionen duplicerar bara DATALADDNINGEN, inte reglerna.
// ---------------------------------------------------------------------------

export interface BulkPerformanceRow extends MatchPerformanceResult {
  playerId: number;
  fixtureId: number;
}

async function loadAllPages<T>(supabase: Supabase, table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1).returns<T[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Beräknar Performance för HELA ligans historik i en enda, effektiv
 * genomgång — läser fixture/fixture_player_stats/player en gång var
 * (paginerat), bearbetar sedan i minnet säsong-för-säsong och
 * positionsgrupp-för-positionsgrupp, kronologiskt, med en ackumulerande
 * kausal peer-pool (matcher på samma dag ser inte varandra). Returnerar en
 * platt lista, sorterad kronologiskt PER SPELARE (redo att matas rakt in i
 * Kalman-uppdateringen match för match).
 */
export async function computeAllMatchPerformancesBulk(supabase: Supabase): Promise<Map<number, BulkPerformanceRow[]>> {
  interface FixtureRow {
    id: number;
    season_id: number;
    kickoff_at: string;
    status: string;
  }
  const fixtures = await loadAllPages<FixtureRow>(supabase, "fixture", "id, season_id, kickoff_at, status");
  const FT_STATUSES = new Set(["FT", "AET", "PEN"]);
  const fixtureById = new Map(fixtures.filter((f) => FT_STATUSES.has(f.status)).map((f) => [f.id, f]));

  const statRows = await loadAllPages<StatRow>(supabase, "fixture_player_stats", STAT_SELECT);

  const players = await loadAllPages<{ id: number; position: string | null }>(supabase, "player", "id, position");
  const positionByPlayer = new Map(players.map((p) => [p.id, p.position]));

  interface QualifyingPerf {
    fixtureId: number;
    playerId: number;
    seasonId: number;
    kickoffAt: string;
    minutes: number;
    positionGroup: PositionGroupKey;
    row: StatRow;
  }
  const qualifying: QualifyingPerf[] = [];
  for (const row of statRows) {
    if (!row.player_id) continue;
    const fixture = fixtureById.get(row.fixture_id);
    if (!fixture) continue;
    if ((row.minutes_played ?? 0) < MIN_MATCH_MINUTES) continue;
    const posGroupInfo = getPositionGroup(positionByPlayer.get(row.player_id) ?? null);
    if (!posGroupInfo) continue;
    qualifying.push({
      fixtureId: row.fixture_id,
      playerId: row.player_id,
      seasonId: fixture.season_id,
      kickoffAt: fixture.kickoff_at,
      minutes: row.minutes_played ?? 0,
      positionGroup: posGroupInfo.group,
      row,
    });
  }

  const bySeasonGroup = new Map<string, QualifyingPerf[]>();
  for (const p of qualifying) {
    const key = `${p.seasonId}_${p.positionGroup}`;
    const arr = bySeasonGroup.get(key) ?? [];
    arr.push(p);
    bySeasonGroup.set(key, arr);
  }

  const byPlayer = new Map<number, BulkPerformanceRow[]>();

  for (const [key, group] of bySeasonGroup) {
    const isGk = key.endsWith("_goalkeeper");
    group.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

    const peerValuesByMetric = new Map<string, number[]>();
    const gkPeerValuesByMetric = new Map<string, number[]>();

    let i = 0;
    while (i < group.length) {
      const day = group[i].kickoffAt.slice(0, 10);
      const batch: QualifyingPerf[] = [];
      while (i < group.length && group[i].kickoffAt.slice(0, 10) === day) {
        batch.push(group[i]);
        i++;
      }

      for (const p of batch) {
        let performance: number | null = null;
        let peerCount = 0;

        if (isGk) {
          const percentiles: number[] = [];
          for (const mKey of Object.keys(GK_METRIC_WEIGHTS) as (keyof typeof GK_METRIC_WEIGHTS)[]) {
            const val = extractGkMatchMetric(p.row, mKey);
            if (val === null) continue;
            const peerVals = gkPeerValuesByMetric.get(mKey) ?? [];
            if (peerVals.length < MIN_PEER_COUNT) continue;
            peerCount = Math.max(peerCount, peerVals.length);
            percentiles.push(mKey === "goalsConcededPer90" ? invertedPercentile(val, peerVals) : percentile(val, peerVals));
          }
          if (percentiles.length > 0) performance = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
        } else {
          const weights = POSITION_RATING_CONFIG[p.positionGroup as Exclude<PositionGroupKey, "goalkeeper">].weights;
          const catScores: Partial<Record<RatingCategoryKey, number>> = {};
          for (const catKey of Object.keys(weights) as RatingCategoryKey[]) {
            const metricsInCat = RATING_METRICS.filter((m) => m.category === catKey);
            const pcts: number[] = [];
            for (const metric of metricsInCat) {
              const val = extractMatchMetric(p.row, metric.key);
              if (val === null) continue;
              const peerVals = peerValuesByMetric.get(metric.key) ?? [];
              if (peerVals.length < MIN_PEER_COUNT) continue;
              peerCount = Math.max(peerCount, peerVals.length);
              pcts.push(percentile(val, peerVals));
            }
            if (pcts.length > 0) catScores[catKey] = pcts.reduce((a, b) => a + b, 0) / pcts.length;
          }
          const availableWeightSum = (Object.keys(catScores) as RatingCategoryKey[]).reduce((a, k) => a + weights[k], 0);
          if (availableWeightSum > 0) {
            let sum = 0;
            for (const k of Object.keys(catScores) as RatingCategoryKey[]) sum += (catScores[k]! * weights[k]) / availableWeightSum;
            performance = sum;
          }
        }

        if (performance !== null) {
          const arr = byPlayer.get(p.playerId) ?? [];
          arr.push({
            playerId: p.playerId,
            fixtureId: p.fixtureId,
            performance,
            peerCount,
            minutesPlayed: p.minutes,
            positionGroup: p.positionGroup,
            seasonId: p.seasonId,
            kickoffAt: p.kickoffAt,
          });
          byPlayer.set(p.playerId, arr);
        }
      }

      for (const p of batch) {
        if (isGk) {
          for (const mKey of Object.keys(GK_METRIC_WEIGHTS) as (keyof typeof GK_METRIC_WEIGHTS)[]) {
            const val = extractGkMatchMetric(p.row, mKey);
            if (val === null) continue;
            const arr = gkPeerValuesByMetric.get(mKey) ?? [];
            arr.push(val);
            gkPeerValuesByMetric.set(mKey, arr);
          }
        } else {
          for (const metric of RATING_METRICS) {
            const val = extractMatchMetric(p.row, metric.key);
            if (val === null) continue;
            const arr = peerValuesByMetric.get(metric.key) ?? [];
            arr.push(val);
            peerValuesByMetric.set(metric.key, arr);
          }
        }
      }
    }
  }

  for (const arr of byPlayer.values()) arr.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  return byPlayer;
}
