/**
 * ============================================================================
 * Player Intelligence Engine — ANALYSFAS (läser output/match-performances.json)
 * ============================================================================
 * Kör de fyra kandidatmodellerna över varje spelares kronologiska
 * match-Performance-sekvens och beräknar valideringsmåtten: stabilitet,
 * responsivitet, prediktiv validitet (STRIKT out-of-sample, ingen framtida
 * information i kalibreringen), sample-size-beteende, cold start,
 * time decay/säsongsuppehåll. Ren analys — ingen databasskrivning.
 */
import * as fs from "fs";
import * as path from "path";
import { runEMA, runCumulative, runStaticBayes, runKalman, type Observation, type TrajectoryPoint } from "./player-intelligence-backtest";

const outDir = path.join(__dirname, "output");
const raw = JSON.parse(fs.readFileSync(path.join(outDir, "match-performances.json"), "utf8")) as Record<
  string,
  { name: string; positionGroup: string; obs: Observation[] }
>;

const players = Object.entries(raw).map(([id, p]) => ({ playerId: Number(id), ...p }));

// ---------------------------------------------------------------------------
// Empiriskt härledda parametrar (INGEN gissning) — se motivering i loggen.
// ---------------------------------------------------------------------------
const allFullMatchPerf = players.flatMap((p) => p.obs.filter((o) => o.minutes >= 85).map((o) => o.performance));
const meanFull = allFullMatchPerf.reduce((a, b) => a + b, 0) / allFullMatchPerf.length;
const obsVarGlobal = allFullMatchPerf.reduce((a, b) => a + (b - meanFull) ** 2, 0) / allFullMatchPerf.length;

// VIKTIG UPPTÄCKT (dokumenterad begränsning): en enda GLOBAL observations-
// varians missar att målvakters match-Performance är 6-8x mer volatil än
// utespelares (bara 3 mått, litet peer-underlag, ofta 0/100 på clean sheet)
// — verifierat empiriskt. Ett globalt värde fick Kalman/Bayes att kraftigt
// ÖVERREAGERA på enskilda målvaktsmatcher (t.ex. K. Joelsson hoppade till
// 92±8 på en enda stark match). Löst med POSITIONSSPECIFIK observations-
// varians — samma princip som redan gäller resten av motorn ("en motor,
// inte nödvändigtvis en identisk formel för alla positioner").
const obsVarByGroup: Record<string, number> = {};
for (const group of ["attacker", "midfielder", "defender", "goalkeeper"]) {
  const vals = players.filter((p) => p.positionGroup === group).flatMap((p) => p.obs.filter((o) => o.minutes >= 85).map((o) => o.performance));
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  obsVarByGroup[group] = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
}
const priorVar = obsVarGlobal * 4; // hög osäkerhet innan någon observation — 4x den GLOBALA enskild-matchs-variansen (konservativ, användbar innan vi vet positionen), en medveten, dokumenterad (inte tillpassad mot facit) startpunkt
// qPerDay: ett 90-dagars vinteruppehåll ska lägga till ungefär EN "medel"-matchs (5 fulla matcher, se CUMULATIVE-priorn) observationsvärde av osäkerhet — räknat per POSITION (målvakter "glömmer" alltså snabbare, konsekvent med deras högre brus).
const qPerDayByGroup: Record<string, number> = {};
for (const group of Object.keys(obsVarByGroup)) qPerDayByGroup[group] = obsVarByGroup[group] / 5 / 90;

console.log("=== EMPIRISKT HÄRLEDDA PARAMETRAR ===");
console.log(`Antal helmatch-observationer (>=85 min) i hela datasetet: ${allFullMatchPerf.length}`);
console.log(`Medel: ${meanFull.toFixed(1)} (förväntat ~50, percentilskalan är centrerad kring peer-medianen per definition)`);
console.log(`Global observationsvarians (en helmatch, alla positioner): ${obsVarGlobal.toFixed(1)} (sd=${Math.sqrt(obsVarGlobal).toFixed(1)})`);
console.log(`Positionsspecifik observationsvarians:`);
for (const [g, v] of Object.entries(obsVarByGroup)) console.log(`  ${g.padEnd(11)} var=${v.toFixed(1)} sd=${Math.sqrt(v).toFixed(1)}`);
console.log(`priorVar (4x global obsVar, positionsoberoende cold-start-prior): ${priorVar.toFixed(1)}`);

const obsVarFor = (positionGroup: string) => obsVarByGroup[positionGroup] ?? obsVarGlobal;
const qPerDayFor = (positionGroup: string) => qPerDayByGroup[positionGroup] ?? obsVarGlobal / 5 / 90;

const MODELS = {
  EMA: (obs: Observation[]) => runEMA(obs, 10), // halveringstid 10 fulla matcher = samma "hög underlag"-tröskel (900 min) som redan etablerat i confidence.ts
  CUMULATIVE: (obs: Observation[]) => runCumulative(obs, 5), // 5 fantom-matcher = samma "medel underlag"-tröskel (450 min)
  BAYES: (obs: Observation[], group: string) => runStaticBayes(obs, priorVar, obsVarFor(group)),
  KALMAN: (obs: Observation[], group: string) => runKalman(obs, priorVar, obsVarFor(group), qPerDayFor(group)),
} as const;
type ModelName = keyof typeof MODELS;

const trajectories = new Map<number, Record<ModelName, TrajectoryPoint[]>>();
for (const p of players) {
  const result = {
    EMA: MODELS.EMA(p.obs),
    CUMULATIVE: MODELS.CUMULATIVE(p.obs),
    BAYES: MODELS.BAYES(p.obs, p.positionGroup),
    KALMAN: MODELS.KALMAN(p.obs, p.positionGroup),
  };
  trajectories.set(p.playerId, result);
}

// ---------------------------------------------------------------------------
// 1) STABILITET — match-till-match |Δestimate| för ETABLERADE spelare
//    (nEffective redan hög, dvs. de har redan mycket ackumulerat underlag).
// ---------------------------------------------------------------------------
console.log("\n=== 1) STABILITET (match-till-match |Δ| hos ETABLERADE spelare, nEffective-motsvarande >=15 matcher) ===");
function stabilityFor(modelName: ModelName | "RAW"): { mean: number; p90: number; n: number } {
  const deltas: number[] = [];
  for (const p of players) {
    if (modelName === "RAW") {
      for (let i = 16; i < p.obs.length; i++) {
        deltas.push(Math.abs(p.obs[i].performance - p.obs[i - 1].performance));
      }
      continue;
    }
    const traj = trajectories.get(p.playerId)![modelName];
    for (let i = 16; i < traj.length; i++) {
      deltas.push(Math.abs(traj[i].estimate - traj[i - 1].estimate));
    }
  }
  deltas.sort((a, b) => a - b);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const p90 = deltas[Math.floor(deltas.length * 0.9)];
  return { mean, p90, n: deltas.length };
}
for (const name of ["RAW", "EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
  const s = stabilityFor(name);
  console.log(`  ${name.padEnd(11)} snitt|Δ|=${s.mean.toFixed(2)}  p90|Δ|=${s.p90.toFixed(2)}  (n=${s.n})`);
}

// ---------------------------------------------------------------------------
// 2) SAMPLE-SIZE ROBUSTHET — hur mycket rör sig skattningen vid den 1:a,
//    2:a, 5:e, 10:e, 20:e matchen (medel |Δ| från föregående skattning)?
// ---------------------------------------------------------------------------
console.log("\n=== 2) SAMPLE-SIZE-ROBUSTHET (medel |Δestimate| vid N:te matchen i karriären, samt osäkerhet) ===");
const sampleCheckpoints = [1, 2, 5, 10, 20];
for (const name of ["EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
  console.log(`  ${name}:`);
  for (const n of sampleCheckpoints) {
    const deltasAtN: number[] = [];
    const sdAtN: number[] = [];
    for (const p of players) {
      const traj = trajectories.get(p.playerId)![name];
      if (traj.length < n) continue;
      if (n === 1) deltasAtN.push(Math.abs(traj[0].estimate - 50));
      else deltasAtN.push(Math.abs(traj[n - 1].estimate - traj[n - 2].estimate));
      if (traj[n - 1].uncertaintySd !== null) sdAtN.push(traj[n - 1].uncertaintySd!);
    }
    const meanDelta = deltasAtN.reduce((a, b) => a + b, 0) / deltasAtN.length;
    const meanSd = sdAtN.length > 0 ? sdAtN.reduce((a, b) => a + b, 0) / sdAtN.length : null;
    console.log(
      `    match #${n}: snitt|Δ eller |avstånd-från-prior||=${meanDelta.toFixed(2)}${meanSd !== null ? `, snitt-osäkerhet(sd)=${meanSd.toFixed(2)}` : ""}  (n=${deltasAtN.length})`
    );
  }
}

// ---------------------------------------------------------------------------
// 3) COLD START — visa de FÖRSTA tre matcherna för 5 slumpmässiga spelare
//    som debuterar sent i datasetet (garanterat "nya", inte trunkerade i
//    starten av vårt datafönster).
// ---------------------------------------------------------------------------
console.log("\n=== 3) COLD START — exempel: en spelares TRE FÖRSTA matcher, alla fyra modeller ===");
const debutants = players.filter((p) => p.obs.length >= 5 && p.obs[0].seasonYear >= 2023).slice(0, 3);
for (const p of debutants) {
  console.log(`\n  ${p.name} (${p.positionGroup}), debut ${p.obs[0].kickoffAt.slice(0, 10)}:`);
  console.log(`    Rå Performance (matcherna): ${p.obs.slice(0, 3).map((o) => o.performance.toFixed(0)).join(", ")}`);
  for (const name of ["EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
    const traj = trajectories.get(p.playerId)![name];
    const vals = traj.slice(0, 3).map((t) => `${t.estimate.toFixed(1)}${t.uncertaintySd !== null ? `±${t.uncertaintySd.toFixed(1)}` : ""}`);
    console.log(`    ${name.padEnd(11)}: ${vals.join(" -> ")}`);
  }
}

// ---------------------------------------------------------------------------
// 4) SYNTETISK RESPONSIVITETSTEST — kontrollerad, känd "sann" nivåförändring.
// ---------------------------------------------------------------------------
console.log("\n=== 4) RESPONSIVITET (SYNTETISKT TEST — känd sann nivåförändring vid match 21) ===");
function synthSeq(before: number, after: number, minutes: number): Observation[] {
  const obs: Observation[] = [];
  let date = new Date("2024-03-01");
  for (let i = 0; i < 40; i++) {
    obs.push({ performance: i < 20 ? before : after, minutes, seasonYear: 2024, kickoffAt: date.toISOString() });
    date = new Date(date.getTime() + 7 * 24 * 3600 * 1000);
  }
  return obs;
}
const synthObs = synthSeq(45, 80, 90); // en spelare som konsekvent låg runt 45:e percentilen, sedan konsekvent 80:e från match 21
for (const name of ["EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
  const traj = name === "BAYES" || name === "KALMAN" ? MODELS[name](synthObs, "midfielder") : MODELS[name](synthObs);
  const before = traj[19].estimate;
  const target = 80;
  const halfwayPoint = target - (target - before) / 2;
  let matchesToHalfway = -1;
  for (let i = 20; i < traj.length; i++) {
    if (traj[i].estimate >= halfwayPoint) {
      matchesToHalfway = i - 19;
      break;
    }
  }
  console.log(
    `  ${name.padEnd(11)}: nivå vid match20=${before.toFixed(1)}, match25=${traj[24].estimate.toFixed(1)}, match30=${traj[29].estimate.toFixed(1)}, match40=${traj[39].estimate.toFixed(1)} | matcher till halvvägs till 80: ${matchesToHalfway === -1 ? ">20" : matchesToHalfway}`
  );
}

// ---------------------------------------------------------------------------
// 5) TIME DECAY / SÄSONGSUPPEHÅLL — Kalmans osäkerhet över ett vinteruppehåll.
// ---------------------------------------------------------------------------
console.log("\n=== 5) TIME DECAY (Kalman-osäkerhet över ett ~110-dagars vinteruppehåll, verkligt exempel) ===");
{
  const gapExample = players.find((p) => {
    for (let i = 1; i < p.obs.length; i++) {
      const days = (new Date(p.obs[i].kickoffAt).getTime() - new Date(p.obs[i - 1].kickoffAt).getTime()) / 86400000;
      if (days > 100 && days < 140) return true;
    }
    return false;
  });
  if (gapExample) {
    const traj = trajectories.get(gapExample.playerId)!.KALMAN;
    for (let i = 1; i < gapExample.obs.length; i++) {
      const days = (new Date(gapExample.obs[i].kickoffAt).getTime() - new Date(gapExample.obs[i - 1].kickoffAt).getTime()) / 86400000;
      if (days > 100 && days < 140) {
        console.log(`  ${gapExample.name}: ${Math.round(days)} dagars uppehåll mellan match ${i} och ${i + 1}`);
        console.log(`    Före uppehållet: estimate=${traj[i - 1].estimate.toFixed(1)}, sd=${traj[i - 1].uncertaintySd!.toFixed(2)}`);
        console.log(`    Efter uppehållet (nästa match, INNAN ny data smälts in — osäkerheten VÄXTE av tiden ensamt): sd skulle ha varit ${Math.sqrt(traj[i - 1].uncertaintySd! ** 2 + qPerDayFor(gapExample.positionGroup) * days).toFixed(2)} precis innan matchen`);
        console.log(`    Efter att nästa match smälts in: estimate=${traj[i].estimate.toFixed(1)}, sd=${traj[i].uncertaintySd!.toFixed(2)}`);
        break;
      }
    }
  } else {
    console.log("  Inget exempel hittades med uppehåll i det intervallet.");
  }
}

fs.writeFileSync(
  path.join(outDir, "trajectories-summary-done.json"),
  JSON.stringify({ meanFull, obsVarGlobal, obsVarByGroup, priorVar, qPerDayByGroup })
);
console.log("\nKlar (del 1). Kör player-intelligence-validate.ts för prediktiv validitet + verkliga exempel.");
