import type { PositionGroupKey } from "../position-group";
import { LEAGUE_PRIOR_MEAN, PRIOR_VARIANCE, OBS_VARIANCE_BY_GROUP, Q_PER_DAY_BY_GROUP, OVR_DISPLAY_CAP } from "./player-intelligence-params";

/**
 * ============================================================================
 * Player Intelligence Engine — Kalman state (ren matematik, ingen databas)
 * ============================================================================
 * Produktionsversionen av samma ekvation som redan backtestad i
 * scripts/research/player-intelligence-backtest.ts:s runKalman() — men
 * ETT STEG I TAGET (produktionen matar in en match åt gången när den
 * importeras, inte en hel historisk array på en gång). Matematiskt
 * identisk, bara omformad kring "state in, ny observation, state out"
 * istället för "hela sekvensen på en gång".
 *
 * INGEN spelarspecifik kod — funktionerna vet ingenting om VILKEN spelare
 * de körs för, bara position + tal.
 */

export interface KalmanState {
  /** Kalman-mean — motsvarar "OVR" på samma 0–100-percentilskala som Performance. INTE avrundad eller capad — bara rå matematik. */
  mean: number;
  /** Kalman-varians (INTE standardavvikelse — se uncertaintySd nedan för det). */
  variance: number;
}

/** Cold-start-state för en spelare utan tidigare Player Intelligence-historik — samma generella prior för ALLA spelare, oavsett position (rapportens punkt 8/K: "ingen spelarspecifik startnivå"). */
export function coldStartState(): KalmanState {
  return { mean: LEAGUE_PRIOR_MEAN, variance: PRIOR_VARIANCE };
}

export interface MatchObservation {
  /** 0–100, samma percentilskala som staten. */
  performance: number;
  minutesPlayed: number;
}

export interface KalmanUpdateResult {
  before: KalmanState;
  after: KalmanState;
  /** Kalman-gain som faktiskt användes för den här uppdateringen — 0–1, hur mycket ny evidens fick väga mot tidigare state. Sparas inte i databasen men användbar för loggning/felsökning. */
  gain: number;
}

/**
 * Ett enda Kalman-steg: predict (osäkerheten växer med tiden sedan senaste
 * observationen, positionsspecifikt processbrus) + update (ny observation
 * smälts in, viktad av hur mycket speltid den bygger på).
 *
 * `daysSinceLast` — null för spelarens FÖRSTA observation någonsin (inget
 * "sedan förra" att räkna på, predict-steget hoppas då över helt, staten
 * är redan cold-start-priorn). ALDRIG negativ i praktiken (matcher
 * importeras kronologiskt) — men om det skulle hända (t.ex. en sen
 * korrigering av en äldre match) clampas den till 0 istället för att låta
 * osäkerheten krympa av misstag.
 */
export function applyKalmanUpdate(
  priorState: KalmanState,
  observation: MatchObservation,
  positionGroup: PositionGroupKey,
  daysSinceLast: number | null
): KalmanUpdateResult {
  const obsVarAtFullMatch = OBS_VARIANCE_BY_GROUP[positionGroup];
  const qPerDay = Q_PER_DAY_BY_GROUP[positionGroup];

  // Predict.
  let variance = priorState.variance;
  if (daysSinceLast !== null) {
    variance += qPerDay * Math.max(0, daysSinceLast);
  }
  const predicted: KalmanState = { mean: priorState.mean, variance };

  // Update. Mindre speltid -> större observationsvarians (mindre tillförlitlig observation) — samma "minuter/90"-skalning som redan etablerad i forskningen och i övriga Scout Intelligence-mått (t.ex. scout-intelligence-consistency.ts).
  const obsVar = obsVarAtFullMatch / Math.max(0.05, observation.minutesPlayed / 90);
  const gain = predicted.variance / (predicted.variance + obsVar);
  const mean = predicted.mean + gain * (observation.performance - predicted.mean);
  const newVariance = (1 - gain) * predicted.variance;

  return {
    before: priorState,
    after: { mean, variance: newVariance },
    gain,
  };
}

/** Standardavvikelse (den faktiska "±"-siffran) ur variansen — genuint matematiskt, inte en kosmetisk badge (rapportens punkt N/10). */
export function uncertaintySd(state: KalmanState): number {
  return Math.sqrt(state.variance);
}

/** OVR för VISNING — avrundad och capad vid 99 (samma cap som befintliga compute-rating.ts/goalkeeper-rating.ts), men det interna state.mean som sparas/uppdateras nästa gång förblir alltid det obegränsade, oavrundade talet. */
export function displayOvr(state: KalmanState): number {
  return Math.min(OVR_DISPLAY_CAP, Math.round(state.mean));
}

/**
 * Anomali-flagga (rapportens punkt O) — ren diagnostik, ändrar ALDRIG
 * resultatet. Flaggar en förändring som statistiskt ovanligt stor relativt
 * positionens EGEN brusnivå, inte en godtycklig poängtröskel.
 */
export function isAnomalousChange(before: KalmanState, after: KalmanState, positionGroup: PositionGroupKey, sigmaThreshold: number): boolean {
  const obsSd = Math.sqrt(OBS_VARIANCE_BY_GROUP[positionGroup]);
  return Math.abs(after.mean - before.mean) > sigmaThreshold * obsSd;
}
