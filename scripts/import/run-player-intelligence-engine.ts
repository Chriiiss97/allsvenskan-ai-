/**
 * ============================================================================
 * Player Intelligence Engine — backfill/uppdateringskörning (SHADOW MODE)
 * ============================================================================
 * Kör den nya motorn över hela ligans matchhistorik och skriver resultatet
 * till player_intelligence_state/player_intelligence_history — VID SIDAN
 * AV, INTE ISTÄLLET FÖR, den befintliga player_season_rating (dagens OVR,
 * skriven av refresh-ratings.ts, som denna körning ALDRIG rör).
 *
 * Kräver att migrationen supabase/migrations/
 * 20260822140000_player_intelligence_engine.sql är körd först.
 *
 * Läser Performance i bulk (player-intelligence-performance.ts:s
 * computeAllMatchPerformancesBulk — en effektiv, en gång var-laddning,
 * samma mönster som redan bevisat i forskningsfasen) och kör sedan,
 * PER SPELARE, samma Kalman-steg (player-intelligence-state.ts) som
 * produktionens per-match-väg (player-intelligence-engine.ts) skulle ha
 * kört om matcherna kommit in en och en — matematiskt identiskt, bara
 * effektivare data-inläsning för en engångs-backfill av HELA historiken.
 *
 * Idempotent: kan köras om — upsertar state (senaste vinner) och historik
 * (onConflict player_id+fixture_id, samma rad skrivs bara över med samma
 * värden om inget i underliggande data ändrats).
 *
 * Körs: npx tsx scripts/import/run-player-intelligence-engine.ts
 */
import { createAdminClient } from "./admin-client";
import { computeAllMatchPerformancesBulk, type BulkPerformanceRow } from "../../lib/football/rating/player-intelligence-performance";
import { coldStartState, applyKalmanUpdate, isAnomalousChange, type KalmanState } from "../../lib/football/rating/player-intelligence-state";
import { ANOMALY_SIGMA_THRESHOLD, MODEL_VERSION } from "../../lib/football/rating/player-intelligence-params";
import type { PositionGroupKey } from "../../lib/football/position-group";

const supabase = createAdminClient();

interface StateRow {
  player_id: number;
  position_group: PositionGroupKey;
  ovr: number;
  uncertainty_sd: number;
  last_fixture_id: number;
  last_kickoff_at: string;
  observation_count: number;
  model_version: string;
  updated_at: string;
}
interface HistoryRow {
  player_id: number;
  fixture_id: number;
  position_group: PositionGroupKey;
  kickoff_at: string;
  minutes_played: number;
  performance: number;
  ovr_before: number;
  uncertainty_before: number;
  ovr_after: number;
  uncertainty_after: number;
  days_since_last: number | null;
  anomaly_flag: boolean;
  anomaly_reason: string | null;
  model_version: string;
}

function runPlayerSequence(perfs: BulkPerformanceRow[]): { finalState: KalmanState; history: HistoryRow[] } {
  let state = coldStartState();
  let lastKickoffAt: string | null = null;
  const history: HistoryRow[] = [];

  for (const p of perfs) {
    const daysSinceLast = lastKickoffAt ? (new Date(p.kickoffAt).getTime() - new Date(lastKickoffAt).getTime()) / 86_400_000 : null;
    const { before, after } = applyKalmanUpdate(state, { performance: p.performance!, minutesPlayed: p.minutesPlayed }, p.positionGroup, daysSinceLast);
    const anomalous = isAnomalousChange(before, after, p.positionGroup, ANOMALY_SIGMA_THRESHOLD);

    history.push({
      player_id: p.playerId,
      fixture_id: p.fixtureId,
      position_group: p.positionGroup,
      kickoff_at: p.kickoffAt,
      minutes_played: p.minutesPlayed,
      performance: p.performance!,
      ovr_before: before.mean,
      uncertainty_before: Math.sqrt(before.variance),
      ovr_after: after.mean,
      uncertainty_after: Math.sqrt(after.variance),
      days_since_last: daysSinceLast,
      anomaly_flag: anomalous,
      anomaly_reason: anomalous
        ? `|Δ|=${Math.abs(after.mean - before.mean).toFixed(1)} > ${ANOMALY_SIGMA_THRESHOLD}×σ_${p.positionGroup} (Performance=${p.performance!.toFixed(1)}, ${p.minutesPlayed} min, ${p.peerCount} peers)`
        : null,
      model_version: MODEL_VERSION,
    });

    state = after;
    lastKickoffAt = p.kickoffAt;
  }

  return { finalState: state, history };
}

async function main() {
  console.log("Läser Performance för hela ligans historik (bulk)...");
  const byPlayer = await computeAllMatchPerformancesBulk(supabase);
  console.log(`  ${byPlayer.size} spelare med minst en poängsatt matchprestation.`);

  const stateRows: StateRow[] = [];
  const historyRows: HistoryRow[] = [];
  let anomalyCount = 0;

  for (const [playerId, perfs] of byPlayer) {
    const { finalState, history } = runPlayerSequence(perfs);
    const last = perfs[perfs.length - 1];

    stateRows.push({
      player_id: playerId,
      position_group: last.positionGroup,
      ovr: finalState.mean,
      uncertainty_sd: Math.sqrt(finalState.variance),
      last_fixture_id: last.fixtureId,
      last_kickoff_at: last.kickoffAt,
      observation_count: perfs.length,
      model_version: MODEL_VERSION,
      updated_at: new Date().toISOString(),
    });
    historyRows.push(...history);
    anomalyCount += history.filter((h) => h.anomaly_flag).length;
  }

  console.log(`\nSkriver ${stateRows.length} state-rader...`);
  const STATE_CHUNK = 500;
  for (let i = 0; i < stateRows.length; i += STATE_CHUNK) {
    const chunk = stateRows.slice(i, i + STATE_CHUNK);
    const { error } = await supabase.from("player_intelligence_state").upsert(chunk, { onConflict: "player_id" });
    if (error) throw error;
  }

  console.log(`Skriver ${historyRows.length} historikrader...`);
  const HISTORY_CHUNK = 500;
  for (let i = 0; i < historyRows.length; i += HISTORY_CHUNK) {
    const chunk = historyRows.slice(i, i + HISTORY_CHUNK);
    const { error } = await supabase.from("player_intelligence_history").upsert(chunk, { onConflict: "player_id,fixture_id" });
    if (error) throw error;
  }

  console.log(`\nKlart. ${stateRows.length} spelare, ${historyRows.length} matchuppdateringar, ${anomalyCount} flaggade som anomalier (${((anomalyCount / historyRows.length) * 100).toFixed(1)}%).`);
  console.log(`Modellversion: ${MODEL_VERSION}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
