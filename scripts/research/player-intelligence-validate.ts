/**
 * ============================================================================
 * Player Intelligence Engine — VALIDERINGSFAS (prediktiv validitet + verkliga exempel)
 * ============================================================================
 * KRITISKT för att undvika data leakage — TVÅ separata kalibreringar:
 *
 * 1) "VERKLIGA EXEMPEL"-sektionen (vad säger modellen NU) använder
 *    analyze.ts:s parametrar, kalibrerade på HELA datasetet 2016–2026 —
 *    korrekt här, det är inget prediktivt test, bara en presentation av
 *    dagens bästa skattning.
 * 2) "PREDIKTIV VALIDITET"-sektionen (kan skattningen förutsäga FRAMTIDA
 *    prestation) kalibrerar OM, lokalt i den här filen, EXAKT samma formel
 *    men bara på observationer FÖRE cutoff-datumet — så att INTE ens
 *    brusnivå-parametrarna (obsVar/priorVar/qPerDay) sett något av
 *    2026-datan innan de "frystes". En strikt simulering av vad en
 *    produktionsmotor faktiskt skulle ha känt till i augusti 2025.
 *
 * Prediktiv validitet, metod: för varje spelare, ta modellens skattning vid
 * SISTA matchen 2025-08-01 eller tidigare (dvs. bygg trajectorien BARA av
 * matcher fram till det datumet — 2026-matcher existerar inte för modellen
 * vid den tidpunkten) och korrelera den mot spelarens FAKTISKA rå
 * Performance-snitt i de första K matcherna 2026. Jämförs mot dagens
 * FAKTISKT LAGRADE player_season_rating.ovr (2025) som baslinje.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import * as fs from "fs";
import * as path from "path";
import { runEMA, runCumulative, runStaticBayes, runKalman, type Observation, type TrajectoryPoint } from "./player-intelligence-backtest";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const outDir = path.join(__dirname, "output");
const raw = JSON.parse(fs.readFileSync(path.join(outDir, "match-performances.json"), "utf8")) as Record<
  string,
  { name: string; positionGroup: string; obs: Observation[] }
>;
const { meanFull, obsVarByGroup, priorVar, qPerDayByGroup } = JSON.parse(
  fs.readFileSync(path.join(outDir, "trajectories-summary-done.json"), "utf8")
) as { meanFull: number; obsVarByGroup: Record<string, number>; priorVar: number; qPerDayByGroup: Record<string, number> };
void meanFull;

const players = Object.entries(raw).map(([id, p]) => ({ playerId: Number(id), ...p }));

// Modeller kalibrerade på HELA datasetets deskriptiva statistik (analyze.ts)
// — används för "VERKLIGA EXEMPEL"-sektionen nedan, som visar "vad säger
// modellen NU, givet allt vi vet" — INTE ett prediktivt out-of-sample-test,
// så det finns ingen läckagerisk där.
const MODELS = {
  EMA: (obs: Observation[]) => runEMA(obs, 10),
  CUMULATIVE: (obs: Observation[]) => runCumulative(obs, 5),
  BAYES: (obs: Observation[], group: string) => runStaticBayes(obs, priorVar, obsVarByGroup[group]),
  KALMAN: (obs: Observation[], group: string) => runKalman(obs, priorVar, obsVarByGroup[group], qPerDayByGroup[group]),
} as const;
type ModelName = keyof typeof MODELS;

/**
 * SKÄRPT LÄCKAGEKONTROLL (2026-08-22, uppföljning på användarens uttryckliga
 * krav i punkt 3): parametrarna ovan (obsVarByGroup/priorVar/qPerDayByGroup)
 * är beräknade i analyze.ts från HELA datasetet 2016–2026 — inklusive
 * matcherna i 2026 som används som "framtida" utfall i det prediktiva
 * testet nedan. Det är INTE en läcka av spelarspecifika UTFALL (parametrarna
 * är rena brusnivåer, tillpassade mot ingenting), men det är inte heller
 * en fullständigt ärlig simulering av "vad visste vi vid tidpunkt T" — i
 * verklig produktion skulle bara 2016–2025 varit kända innan 2026-testet.
 * Kalibrerar därför HÄR om separat, EXAKT samma formel, men bara på
 * observationer FÖRE CUTOFF (deklareras nedan) — och använder BARA den
 * kalibreringen i det prediktiva testet, inte i "verkliga exempel"-sektionen.
 */

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

async function main() {
  // ---------------------------------------------------------------------
  // PREDIKTIV VALIDITET
  // ---------------------------------------------------------------------
  const CUTOFF = new Date("2025-08-01").getTime(); // efter 2025 säsongen är i praktiken klar, före 2026 börjar
  const FUTURE_START = new Date("2026-01-01").getTime();
  const MIN_FUTURE_MATCHES = 3;

  // --- LÄCKAGEFRI kalibrering: EXAKT samma formel som analyze.ts, men bara på
  // observationer strikt FÖRE CUTOFF (pooled över alla spelare) — motsvarar
  // vad en produktionsmotor faktiskt skulle ha känt till i augusti 2025.
  const preCutoffFullMatchPerf = players.flatMap((p) =>
    p.obs.filter((o) => o.minutes >= 85 && new Date(o.kickoffAt).getTime() <= CUTOFF).map((o) => o.performance)
  );
  const preCutoffObsVarByGroup: Record<string, number> = {};
  const preCutoffQPerDayByGroup: Record<string, number> = {};
  for (const group of ["attacker", "midfielder", "defender", "goalkeeper"]) {
    const vals = players
      .filter((p) => p.positionGroup === group)
      .flatMap((p) => p.obs.filter((o) => o.minutes >= 85 && new Date(o.kickoffAt).getTime() <= CUTOFF).map((o) => o.performance));
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    preCutoffObsVarByGroup[group] = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
    preCutoffQPerDayByGroup[group] = preCutoffObsVarByGroup[group] / 5 / 90;
  }
  const preCutoffGlobalMean = preCutoffFullMatchPerf.reduce((a, b) => a + b, 0) / preCutoffFullMatchPerf.length;
  const preCutoffObsVarGlobal =
    preCutoffFullMatchPerf.reduce((a, b) => a + (b - preCutoffGlobalMean) ** 2, 0) / preCutoffFullMatchPerf.length;
  const preCutoffPriorVar = preCutoffObsVarGlobal * 4;

  console.log("=== LÄCKAGEFRI (bara pre-2025-08-01-data) kalibrering, jämfört med den fulla-datasetet-kalibreringen ===");
  for (const group of ["attacker", "midfielder", "defender", "goalkeeper"]) {
    console.log(
      `  ${group.padEnd(11)} obsVar: helt dataset=${obsVarByGroup[group].toFixed(1)}  pre-cutoff-only=${preCutoffObsVarByGroup[group].toFixed(1)} (${(((preCutoffObsVarByGroup[group] - obsVarByGroup[group]) / obsVarByGroup[group]) * 100).toFixed(1)}% skillnad)`
    );
  }

  const PRECUTOFF_MODELS = {
    BAYES: (obs: Observation[], group: string) => runStaticBayes(obs, preCutoffPriorVar, preCutoffObsVarByGroup[group]),
    KALMAN: (obs: Observation[], group: string) => runKalman(obs, preCutoffPriorVar, preCutoffObsVarByGroup[group], preCutoffQPerDayByGroup[group]),
  } as const;

  interface ValRow {
    playerId: number;
    name: string;
    positionGroup: string;
    minutesBefore: number;
    matchesBefore: number;
    actualFuturePerf: number;
    storedOvr2025: number | null;
    modelEstimates: Record<ModelName, number>;
  }
  const valRows: ValRow[] = [];

  // Paginerad — player_season_rating har 4600+ rader, samma kända
  // Supabase-1000-radsfallgrop som redan fångad (och fixad) på
  // `player`-tabellen i backtest.ts, tillämpad här också.
  const storedRatings: { player_id: number; ovr: number | null; season: { year: number } | null }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("player_season_rating")
        .select("player_id, ovr, season:season_id(year)")
        .range(from, from + PAGE - 1)
        .returns<{ player_id: number; ovr: number | null; season: { year: number } | null }[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      storedRatings.push(...data);
      if (data.length < PAGE) break;
    }
  }
  const ovr2025ByPlayer = new Map<number, number>();
  for (const r of storedRatings) {
    if (r.season?.year === 2025 && r.ovr !== null) ovr2025ByPlayer.set(r.player_id, r.ovr);
  }

  for (const p of players) {
    const before = p.obs.filter((o) => new Date(o.kickoffAt).getTime() <= CUTOFF);
    const future = p.obs.filter((o) => new Date(o.kickoffAt).getTime() >= FUTURE_START);
    if (before.length < 3 || future.length < MIN_FUTURE_MATCHES) continue;

    const futureK = future.slice(0, MIN_FUTURE_MATCHES);
    const actualFuturePerf = futureK.reduce((a, o) => a + o.performance, 0) / futureK.length;

    const modelEstimates = {
      EMA: MODELS.EMA(before)[before.length - 1]?.estimate,
      CUMULATIVE: MODELS.CUMULATIVE(before)[before.length - 1]?.estimate,
      BAYES: PRECUTOFF_MODELS.BAYES(before, p.positionGroup)[before.length - 1]?.estimate,
      KALMAN: PRECUTOFF_MODELS.KALMAN(before, p.positionGroup)[before.length - 1]?.estimate,
    } as Record<ModelName, number>;

    valRows.push({
      playerId: p.playerId,
      name: p.name,
      positionGroup: p.positionGroup,
      minutesBefore: before.reduce((a, o) => a + o.minutes, 0),
      matchesBefore: before.length,
      actualFuturePerf,
      storedOvr2025: ovr2025ByPlayer.get(p.playerId) ?? null,
      modelEstimates,
    });
  }

  console.log(`=== PREDIKTIV VALIDITET (n=${valRows.length} spelare med >=3 matcher fram till 2025-08-01 OCH >=${MIN_FUTURE_MATCHES} matcher 2026) ===`);
  console.log(`Mäter: korrelation mellan skattning FÖRE 2026 och FAKTISKT rå Performance-snitt i de första ${MIN_FUTURE_MATCHES} 2026-matcherna.\n`);

  for (const name of ["EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
    const xs = valRows.map((r) => r.modelEstimates[name]);
    const ys = valRows.map((r) => r.actualFuturePerf);
    console.log(`  ${name.padEnd(11)} r=${pearson(xs, ys).toFixed(3)}`);
  }
  const stored = valRows.filter((r) => r.storedOvr2025 !== null);
  console.log(
    `  ${"LAGRAD 2025-OVR".padEnd(11)} r=${pearson(stored.map((r) => r.storedOvr2025!), stored.map((r) => r.actualFuturePerf)).toFixed(3)} (n=${stored.length}, dagens FAKTISKA produktionssystem, som baslinje)`
  );
  const rawLast = valRows.map((r) => {
    const p = players.find((pp) => pp.playerId === r.playerId)!;
    const before = p.obs.filter((o) => new Date(o.kickoffAt).getTime() <= CUTOFF);
    return before[before.length - 1].performance;
  });
  console.log(`  ${"RÅ SENASTE MATCH".padEnd(11)} r=${pearson(rawLast, valRows.map((r) => r.actualFuturePerf)).toFixed(3)} (ingen modell alls, bara senaste matchens rådata)`);

  // Uppdelat på sample-size (litet vs stort underlag före cutoff).
  console.log(`\n  -- Uppdelat på hur mycket underlag spelaren hade FÖRE 2026 --`);
  for (const [label, filterFn] of [
    ["<5 matcher", (r: ValRow) => r.matchesBefore < 5],
    ["5-14 matcher", (r: ValRow) => r.matchesBefore >= 5 && r.matchesBefore < 15],
    ["15+ matcher", (r: ValRow) => r.matchesBefore >= 15],
  ] as const) {
    const subset = valRows.filter(filterFn);
    if (subset.length < 5) continue;
    console.log(`  ${label} (n=${subset.length}):`);
    for (const name of ["EMA", "KALMAN"] as const) {
      const xs = subset.map((r) => r.modelEstimates[name]);
      const ys = subset.map((r) => r.actualFuturePerf);
      console.log(`    ${name.padEnd(11)} r=${pearson(xs, ys).toFixed(3)}`);
    }
  }

  // ---------------------------------------------------------------------
  // VERKLIGA EXEMPEL — gammal (lagrad) OVR vs varje kandidatmodells skattning
  // ---------------------------------------------------------------------
  console.log(`\n\n=== VERKLIGA EXEMPEL: LAGRAD OVR (dagens system) vs KANDIDATMODELLERNAS SKATTNING ===`);
  const exampleNames = ["E. Berisha", "I. Diawara", "H. Carneil", "B. Šabović", "K. Joelsson", "N. Vasić", "M. Sonko"];
  // Paginerad (samma fallgrop — player-tabellen har 2305 rader, se backtest.ts).
  const allPlayerRows: { id: number; full_name: string }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("player").select("id, full_name").range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allPlayerRows.push(...data);
      if (data.length < PAGE) break;
    }
  }
  const idByName = new Map(allPlayerRows.map((p) => [p.full_name, p.id]));

  for (const exName of exampleNames) {
    const pid = idByName.get(exName);
    if (!pid) continue;
    const p = players.find((pp) => pp.playerId === pid);
    if (!p) continue;

    console.log(`\n  --- ${exName} (${p.positionGroup}) ---`);
    const bySeasonStored = storedRatings
      .filter((r) => r.player_id === pid && r.ovr !== null)
      .sort((a, b) => (a.season?.year ?? 0) - (b.season?.year ?? 0));
    console.log(`  Lagrad OVR-historik: ${bySeasonStored.map((r) => `${r.season?.year}=${r.ovr}`).join(", ")}`);

    // Modellens skattning VID SLUTET av varje säsong (kausalt — bygger bara på matcher t.o.m. den säsongens sista match).
    const seasonYears = [...new Set(p.obs.map((o) => o.seasonYear))].sort();
    for (const name of ["EMA", "CUMULATIVE", "BAYES", "KALMAN"] as const) {
      const parts: string[] = [];
      for (const year of seasonYears) {
        const upTo = p.obs.filter((o) => o.seasonYear <= year);
        if (upTo.length === 0) continue;
        const traj = name === "BAYES" || name === "KALMAN" ? MODELS[name](upTo, p.positionGroup) : MODELS[name](upTo);
        const last = traj[traj.length - 1];
        parts.push(`${year}=${last.estimate.toFixed(0)}${last.uncertaintySd !== null ? `±${last.uncertaintySd.toFixed(0)}` : ""}`);
      }
      console.log(`  ${name.padEnd(11)}: ${parts.join(", ")}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
