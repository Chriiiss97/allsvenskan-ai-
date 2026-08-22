/**
 * ENGÅNGS verifieringsscript — bekräftar att produktionens Kalman-steg
 * (lib/football/rating/player-intelligence-state.ts, körd ETT STEG I
 * TAGET) ger EXAKT samma resultat som forskningens redan backtestade
 * runKalman() (scripts/research/player-intelligence-backtest.ts, körd på
 * en hel sekvens samtidigt) — givet SAMMA, empiriskt härledda parametrar
 * (player-intelligence-params.ts). Ren matematisk parity-kontroll, ingen
 * databas inblandad.
 */
import { runKalman } from "./player-intelligence-backtest";
import { coldStartState, applyKalmanUpdate, type KalmanState } from "../../lib/football/rating/player-intelligence-state";
import { PRIOR_VARIANCE, OBS_VARIANCE_BY_GROUP, Q_PER_DAY_BY_GROUP } from "../../lib/football/rating/player-intelligence-params";
import * as fs from "fs";
import * as path from "path";

const outDir = path.join(__dirname, "output");
const raw = JSON.parse(fs.readFileSync(path.join(outDir, "match-performances.json"), "utf8")) as Record<
  string,
  { name: string; positionGroup: "goalkeeper" | "defender" | "midfielder" | "attacker"; obs: { performance: number; minutes: number; seasonYear: number; kickoffAt: string }[] }
>;

const players = Object.entries(raw).map(([id, p]) => ({ playerId: Number(id), ...p }));
const candidates = players.filter((p) => p.obs.length >= 15).slice(0, 8);

console.log(`Kör parity-kontroll mot ${candidates.length} spelare (>=15 matcher)...\n`);

let maxMeanDiff = 0;
let maxVarDiff = 0;

for (const p of candidates) {
  // Forskningens väg: hela sekvensen på en gång.
  const researchTraj = runKalman(p.obs, PRIOR_VARIANCE, OBS_VARIANCE_BY_GROUP[p.positionGroup], Q_PER_DAY_BY_GROUP[p.positionGroup]);
  const researchFinal = researchTraj[researchTraj.length - 1];

  // Produktionens väg: ETT steg i taget, precis som en riktig match-import skulle göra.
  let state: KalmanState = coldStartState();
  let lastKickoff: string | null = null;
  for (const o of p.obs) {
    const daysSinceLast = lastKickoff ? (new Date(o.kickoffAt).getTime() - new Date(lastKickoff).getTime()) / 86_400_000 : null;
    const { after } = applyKalmanUpdate(state, { performance: o.performance, minutesPlayed: o.minutes }, p.positionGroup, daysSinceLast);
    state = after;
    lastKickoff = o.kickoffAt;
  }

  const meanDiff = Math.abs(state.mean - researchFinal.estimate);
  const sdDiff = Math.abs(Math.sqrt(state.variance) - (researchFinal.uncertaintySd ?? 0));
  maxMeanDiff = Math.max(maxMeanDiff, meanDiff);
  maxVarDiff = Math.max(maxVarDiff, sdDiff);

  console.log(
    `${p.name.padEnd(20)} (${p.positionGroup.padEnd(10)}, ${p.obs.length} matcher): forskning=${researchFinal.estimate.toFixed(4)}±${(researchFinal.uncertaintySd ?? 0).toFixed(4)}  produktion=${state.mean.toFixed(4)}±${Math.sqrt(state.variance).toFixed(4)}  |Δmean|=${meanDiff.toExponential(2)} |Δsd|=${sdDiff.toExponential(2)}`
  );
}

console.log(`\nStörsta avvikelse över alla ${candidates.length} spelare: |Δmean|=${maxMeanDiff.toExponential(2)}, |Δsd|=${maxVarDiff.toExponential(2)}`);
console.log(maxMeanDiff < 1e-6 && maxVarDiff < 1e-6 ? "✅ PARITET BEKRÄFTAD (flyttalsprecision, <1e-6)." : "❌ AVVIKELSE — produktionens matematik matchar INTE forskningens, undersök innan backfill körs.");
