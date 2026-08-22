import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PositionGroupKey } from "../position-group";
import { computeMatchPerformance } from "./player-intelligence-performance";
import { coldStartState, applyKalmanUpdate, isAnomalousChange, type KalmanState } from "./player-intelligence-state";
import { ANOMALY_SIGMA_THRESHOLD, MODEL_VERSION } from "./player-intelligence-params";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Player Intelligence Engine — orkestrering (compute, INTE persist)
 * ============================================================================
 * En spelare, en match: läser Performance (player-intelligence-performance.ts)
 * + föregående sparade state (player_intelligence_state) → kör ett
 * Kalman-steg (player-intelligence-state.ts) → returnerar resultatet.
 * SKRIVER ALDRIG till databasen själv — samma "compute här, persistera i
 * scripts/import/"-uppdelning som redan etablerad mellan compute-rating.ts
 * och refresh-ratings.ts. scripts/import/run-player-intelligence-engine.ts
 * anropar den här funktionen och gör själva upsert/insert.
 *
 * INGEN spelarspecifik kod — funktionen tar bara ett player_id/fixture_id
 * och behandlar alla spelare identiskt genom samma pipeline.
 */

export interface EngineUpdateResult {
  playerId: number;
  fixtureId: number;
  positionGroup: PositionGroupKey;
  kickoffAt: string;
  minutesPlayed: number;
  performance: number;
  peerCount: number;
  before: KalmanState;
  after: KalmanState;
  daysSinceLast: number | null;
  isAnomaly: boolean;
  anomalyReason: string | null;
  modelVersion: string;
}

interface StoredState {
  ovr: number;
  uncertainty_sd: number;
  last_kickoff_at: string | null;
}

/**
 * Beräknar (INTE sparar) motorns uppdatering för EN spelares EN match.
 * Returnerar null om spelaren saknade kvalificerande speltid ELLER om den
 * kausala peer-poolen var för liten för ett Performance-värde den matchen
 * — anroparen hoppar då bara över den matchen för den spelaren, exakt
 * samma regel som redan i forskningsfasen (aldrig ett gissat värde).
 */
export async function computeEngineUpdate(
  supabase: Supabase,
  params: { playerId: number; fixtureId: number }
): Promise<EngineUpdateResult | null> {
  const matchPerf = await computeMatchPerformance(supabase, params);
  if (!matchPerf || matchPerf.performance === null) return null;

  const { data: storedState, error: stateError } = await supabase
    .from("player_intelligence_state")
    .select("ovr, uncertainty_sd, last_kickoff_at")
    .eq("player_id", params.playerId)
    .maybeSingle();
  if (stateError) throw stateError;
  const stored = storedState as StoredState | null;

  const priorState: KalmanState = stored ? { mean: stored.ovr, variance: stored.uncertainty_sd ** 2 } : coldStartState();

  let daysSinceLast: number | null = null;
  if (stored?.last_kickoff_at) {
    daysSinceLast = (new Date(matchPerf.kickoffAt).getTime() - new Date(stored.last_kickoff_at).getTime()) / 86_400_000;
  }

  const { before, after } = applyKalmanUpdate(
    priorState,
    { performance: matchPerf.performance, minutesPlayed: matchPerf.minutesPlayed },
    matchPerf.positionGroup,
    daysSinceLast
  );

  const anomalous = isAnomalousChange(before, after, matchPerf.positionGroup, ANOMALY_SIGMA_THRESHOLD);

  return {
    playerId: params.playerId,
    fixtureId: params.fixtureId,
    positionGroup: matchPerf.positionGroup,
    kickoffAt: matchPerf.kickoffAt,
    minutesPlayed: matchPerf.minutesPlayed,
    performance: matchPerf.performance,
    peerCount: matchPerf.peerCount,
    before,
    after,
    daysSinceLast,
    isAnomaly: anomalous,
    anomalyReason: anomalous
      ? `|Δ|=${Math.abs(after.mean - before.mean).toFixed(1)} > ${ANOMALY_SIGMA_THRESHOLD}×σ_${matchPerf.positionGroup} (Performance=${matchPerf.performance.toFixed(1)}, ${matchPerf.minutesPlayed} min, ${matchPerf.peerCount} peers)`
      : null,
    modelVersion: MODEL_VERSION,
  };
}
