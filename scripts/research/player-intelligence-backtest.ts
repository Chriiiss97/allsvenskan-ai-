/**
 * ============================================================================
 * Player Intelligence Engine — RESEARCH/BACKTEST-PROTOTYP (2026-08-22)
 * ============================================================================
 * Ren simulering. Ingen skrivväg till databasen någonstans i den här filen.
 * Läser (importerar) EXAKT samma, oförändrade percentil-/kategori-/vikt-
 * logik som den riktiga Player Rating-motorn (percentile.ts, metric-
 * registry.ts, categories.ts, position-rating-config.ts, position-group.ts)
 * — samma mönster som redan etablerat i ovr-proposal.ts (Fas 13): läs och
 * återanvänd, ändra aldrig. Målvakternas mått är egna (samma tre mått som
 * goalkeeper-rating.ts: räddningsprocent/insläppta mål/clean sheet-andel),
 * bara omräknade PER MATCH istället för per säsong.
 *
 * SKILLNADEN mot dagens system: dagens system räknar en percentil PER
 * SÄSONG (aggregerade säsongstotaler). Den här prototypen räknar en
 * percentil PER MATCH ("Performance") och testar FYRA olika sätt att smälta
 * samman en kronologisk sekvens av match-Performance till en löpande,
 * minneshållande OVR-skattning:
 *
 *   A) EMA        — minutviktad exponentiell utjämning, ingen drift-modell.
 *   B) BAYES       — statisk precisionsviktad sammanslagning (Normal-Normal-
 *                    konjugat), observationsvarians ∝ 1/minuter, INGEN
 *                    "glömska" mellan matcher (samlar bevis för evigt).
 *   C) KALMAN      — samma som B men med processbrus Q mellan matcher →
 *                    tillåter genuin drift/glömska över tid (hanterar
 *                    säsongsuppehåll naturligt), ger ett riktigt
 *                    osäkerhetsintervall.
 *   D) CUMULATIVE  — enklast möjliga pseudo-count-viktat löpande snitt,
 *                    baslinje för att se om B/C:s komplexitet faktiskt
 *                    lönar sig.
 *
 * PEER-POOL FÖR MATCH-PERCENTILEN: ackumulerande, KAUSAL (bara matcher med
 * kickoff_at STRIKT FÖRE den aktuella matchens datum, samma säsong+
 * positionsgrupp) — INGEN framtida information läcker in i en enskild
 * matchs Performance-percentil. Detta är den kritiska data leakage-
 * kontrollen som punkt 18 i uppdraget kräver.
 *
 * Körs read-only mot produktionsdatabasen (bara SELECT). Sparar resultat
 * till scripts/research/output/ (JSON, inte databasen) för vidare analys.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { percentile, invertedPercentile } from "../../lib/football/percentile";
import { RATING_METRICS, type RatingCategoryKey } from "../../lib/football/rating/metric-registry";
import { POSITION_RATING_CONFIG } from "../../lib/football/rating/position-rating-config";
import { getPositionGroup, type PositionGroupKey } from "../../lib/football/position-group";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ---------------------------------------------------------------------------
// 1) Rådata
// ---------------------------------------------------------------------------

interface FixtureRow {
  id: number;
  season_id: number;
  kickoff_at: string;
  status: string;
}
interface StatRow {
  fixture_id: number;
  player_id: number | null;
  team_id: number;
  minutes_played: number | null;
  is_substitute: boolean | null;
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

const MIN_MATCH_MINUTES = 30; // samma golv som redan etablerat i scout-intelligence-consistency.ts denna session

async function loadAll<T>(table: string, select: string): Promise<T[]> {
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

// ---------------------------------------------------------------------------
// 2) Per-match "Performance" — EXAKT samma percentil-/kategori-/vikt-mekanik
//    som riktiga Player Rating, bara applicerad på EN matchs siffror istället
//    för en säsongssumma. Målvakt: samma tre mått som goalkeeper-rating.ts.
// ---------------------------------------------------------------------------

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return (value / minutes) * 90;
}
function pctOf(num: number, den: number): number | null {
  if (den <= 0) return null;
  return (num / den) * 100;
}

/** Läser ut ett OUTFIELD-måtts råvärde för EN match (inte en säsongssumma) — samma nyckelmängd som metric-registry.ts, bara per-match-nämnare. */
function extractMatchMetric(row: StatRow, key: string): number | null {
  const m = row.minutes_played ?? 0;
  switch (key) {
    case "goalsPer90": return per90(row.goals ?? 0, m);
    case "shotsTotalPer90": return per90(row.shots_total ?? 0, m);
    case "shotsOnTargetPer90": return per90(row.shots_on_target ?? 0, m);
    case "passesTotalPer90": return per90(row.passes_total ?? 0, m);
    case "passesAccuracyPct": return row.passes_accuracy; // redan en procentsats för denna match
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

interface QualifyingPerf {
  fixtureId: number;
  playerId: number;
  seasonId: number;
  kickoffAt: string;
  minutes: number;
  isStarter: boolean;
  positionGroup: Exclude<PositionGroupKey, never>;
  row: StatRow;
}

interface PerfWithScore extends QualifyingPerf {
  performance: number | null; // 0-100 percentil, null om peer-poolen var för liten (<4)
  peerCount: number;
}

/**
 * Bygger, säsong för säsong och positionsgrupp för positionsgrupp, en
 * KAUSAL (aldrig framåtblickande) match-Performance-percentil för varje
 * kvalificerande prestation — samma "empirisk rank"-metod som
 * lib/football/percentile.ts redan använder, bara med en peer-pool som
 * bara innehåller matcher STRIKT FÖRE den aktuella matchens datum.
 */
function computeMatchPerformances(
  perfs: QualifyingPerf[]
): PerfWithScore[] {
  const results: PerfWithScore[] = [];

  const bySeasonGroup = new Map<string, QualifyingPerf[]>();
  for (const p of perfs) {
    const key = `${p.seasonId}_${p.positionGroup}`;
    const arr = bySeasonGroup.get(key) ?? [];
    arr.push(p);
    bySeasonGroup.set(key, arr);
  }

  for (const [key, group] of bySeasonGroup) {
    const isGk = key.endsWith("_goalkeeper");
    group.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

    // Peer-värden ackumulerade PER MÅTT, i kronologisk ordning — lagt till
    // EFTER att aktuell matchdags alla prestationer räknats, aldrig innan
    // (matcher på exakt samma dag ser INTE varandra — peer-poolen är "läget
    // vid dagens start").
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
        if (isGk) {
          const percentiles: number[] = [];
          let peerCount = 0;
          for (const mKey of Object.keys(GK_METRIC_WEIGHTS) as (keyof typeof GK_METRIC_WEIGHTS)[]) {
            const val = extractGkMatchMetric(p.row, mKey);
            if (val === null) continue;
            const peerVals = gkPeerValuesByMetric.get(mKey) ?? [];
            if (peerVals.length < 4) continue;
            peerCount = Math.max(peerCount, peerVals.length);
            const pct = mKey === "goalsConcededPer90" ? invertedPercentile(val, peerVals) : percentile(val, peerVals);
            percentiles.push(pct);
          }
          results.push({
            ...p,
            performance: percentiles.length > 0 ? percentiles.reduce((a, b) => a + b, 0) / percentiles.length : null,
            peerCount,
          });
        } else {
          const catScores: Partial<Record<RatingCategoryKey, number>> = {};
          let peerCount = 0;
          const weights = POSITION_RATING_CONFIG[p.positionGroup as Exclude<PositionGroupKey, "goalkeeper">].weights;
          for (const catKey of Object.keys(weights) as RatingCategoryKey[]) {
            const metricsInCat = RATING_METRICS.filter((m) => m.category === catKey);
            const pcts: number[] = [];
            for (const metric of metricsInCat) {
              const val = extractMatchMetric(p.row, metric.key);
              if (val === null) continue;
              const peerVals = peerValuesByMetric.get(metric.key) ?? [];
              if (peerVals.length < 4) continue;
              peerCount = Math.max(peerCount, peerVals.length);
              pcts.push(percentile(val, peerVals));
            }
            if (pcts.length > 0) catScores[catKey] = pcts.reduce((a, b) => a + b, 0) / pcts.length;
          }
          const availableWeightSum = (Object.keys(catScores) as RatingCategoryKey[]).reduce((a, k) => a + weights[k], 0);
          let performance: number | null = null;
          if (availableWeightSum > 0) {
            let sum = 0;
            for (const k of Object.keys(catScores) as RatingCategoryKey[]) {
              sum += (catScores[k]! * weights[k]) / availableWeightSum;
            }
            performance = sum;
          }
          results.push({ ...p, performance, peerCount });
        }
      }

      // NU lägg till dagens batch i peer-poolerna, för FRAMTIDA matcher.
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

  return results;
}

// ---------------------------------------------------------------------------
// 3) De FYRA kandidatmodellerna — ren matematik, ingen databas, ingen
//    spelarspecifik kod. Alla tar samma indata: en kronologisk sekvens av
//    (performance 0-100, minutes, seasonYear, dagsAvstånd sedan förra).
// ---------------------------------------------------------------------------

export interface Observation {
  performance: number; // 0-100
  minutes: number;
  seasonYear: number;
  kickoffAt: string;
}

export interface TrajectoryPoint {
  kickoffAt: string;
  seasonYear: number;
  estimate: number;
  uncertaintySd: number | null; // null om modellen inte ger ett meningsfullt intervall (EMA/CUMULATIVE)
  nEffective: number; // "hur mycket bevis" modellen anser sig ha just nu — jämförbar mognadsindikator mellan modeller
}

const LEAGUE_PRIOR_MEAN = 50; // percentil-skalan är redan centrerad kring 50 per definition (empirisk rank mot peers)
const FULL_MATCH_MINUTES = 90;

/** A) Minutviktad EMA. K styr "hur många fulla matcher" det tar att halvera avståndet till en ny nivå. */
function runEMA(obs: Observation[], halfLifeFullMatches: number): TrajectoryPoint[] {
  let estimate = LEAGUE_PRIOR_MEAN;
  let nEff = 0;
  const out: TrajectoryPoint[] = [];
  const lambda = 1 - Math.pow(0.5, 1 / halfLifeFullMatches);
  for (const o of obs) {
    const w = Math.min(1, o.minutes / FULL_MATCH_MINUTES) * lambda;
    estimate = estimate + w * (o.performance - estimate);
    nEff = Math.min(nEff + o.minutes / FULL_MATCH_MINUTES, 1 / lambda);
    out.push({ kickoffAt: o.kickoffAt, seasonYear: o.seasonYear, estimate, uncertaintySd: null, nEffective: nEff });
  }
  return out;
}

/** D) Enklaste möjliga: pseudo-count-viktat kumulativt snitt (aldrig glömska, ingen drift). priorWeightMatches = hur många "fantom-matcher" av liga-snittet det förlorade underlaget motsvarar innan riktig data finns. */
function runCumulative(obs: Observation[], priorWeightMatches: number): TrajectoryPoint[] {
  let weightedSum = LEAGUE_PRIOR_MEAN * priorWeightMatches;
  let totalWeight = priorWeightMatches;
  const out: TrajectoryPoint[] = [];
  for (const o of obs) {
    const w = o.minutes / FULL_MATCH_MINUTES;
    weightedSum += o.performance * w;
    totalWeight += w;
    const estimate = weightedSum / totalWeight;
    out.push({ kickoffAt: o.kickoffAt, seasonYear: o.seasonYear, estimate, uncertaintySd: null, nEffective: totalWeight });
  }
  return out;
}

/** B) Statisk Bayesiansk (Normal-Normal-konjugat), INGEN process-brus — samlar bevis för evigt, blir bara säkrare, aldrig mer osäker. Observationsvarians ∝ 1/minuter (mer speltid = mer precis observation). */
function runStaticBayes(obs: Observation[], priorVar: number, obsVarAtFullMatch: number): TrajectoryPoint[] {
  let mean = LEAGUE_PRIOR_MEAN;
  let variance = priorVar;
  const out: TrajectoryPoint[] = [];
  for (const o of obs) {
    const obsVar = obsVarAtFullMatch / Math.max(0.05, o.minutes / FULL_MATCH_MINUTES); // mindre speltid -> större observationsvarians
    const posteriorVar = 1 / (1 / variance + 1 / obsVar);
    mean = posteriorVar * (mean / variance + o.performance / obsVar);
    variance = posteriorVar;
    out.push({
      kickoffAt: o.kickoffAt,
      seasonYear: o.seasonYear,
      estimate: mean,
      uncertaintySd: Math.sqrt(variance),
      nEffective: priorVar / variance, // hur många gånger mer precist än priorn
    });
  }
  return out;
}

/** C) Kalmanfilter / dynamisk Bayes — samma som B men med processbrus Q ADDERAT INFÖR VARJE observation, skalat med tid sedan förra observationen (dagar) — ger genuin "glömska"/drift, naturligt säsongsuppehålls-beteende, och ett riktigt växande osäkerhetsintervall om spelaren inte spelat på länge. */
function runKalman(obs: Observation[], priorVar: number, obsVarAtFullMatch: number, qPerDay: number): TrajectoryPoint[] {
  let mean = LEAGUE_PRIOR_MEAN;
  let variance = priorVar;
  const out: TrajectoryPoint[] = [];
  let lastDate: number | null = null;
  for (const o of obs) {
    const thisDate = new Date(o.kickoffAt).getTime();
    if (lastDate !== null) {
      const days = Math.max(0, (thisDate - lastDate) / (1000 * 60 * 60 * 24));
      variance += qPerDay * days; // "predict"-steget: osäkerheten växer med tiden sedan senaste observationen
    }
    lastDate = thisDate;

    const obsVar = obsVarAtFullMatch / Math.max(0.05, o.minutes / FULL_MATCH_MINUTES);
    const kalmanGain = variance / (variance + obsVar);
    mean = mean + kalmanGain * (o.performance - mean);
    variance = (1 - kalmanGain) * variance;

    out.push({ kickoffAt: o.kickoffAt, seasonYear: o.seasonYear, estimate: mean, uncertaintySd: Math.sqrt(variance), nEffective: priorVar / variance });
  }
  return out;
}

export { runEMA, runCumulative, runStaticBayes, runKalman };

// ---------------------------------------------------------------------------
// 4) Orkestrering — läs data, bygg sekvenser, kör alla fyra modeller.
// ---------------------------------------------------------------------------

async function main() {
  console.log("Läser fixtures...");
  // VIKTIGT (känd, tidigare dokumenterad fallgrop denna session): Supabases
  // default 1000-radstak — hela `fixture`-tabellen (och FT-filtreringen)
  // MÅSTE gå via den paginerade loadAll(), aldrig ett obegränsat .select().
  const fixtures = await loadAll<FixtureRow>("fixture", "id, season_id, kickoff_at, status");
  const FT_STATUSES = new Set(["FT", "AET", "PEN"]);
  const fixtureById = new Map(fixtures.filter((f) => FT_STATUSES.has(f.status)).map((f) => [f.id, f]));
  console.log(`  ${fixtureById.size} avslutade matcher.`);

  console.log("Läser fixture_player_stats...");
  const statRows = await loadAll<StatRow>(
    "fixture_player_stats",
    "fixture_id, player_id, team_id, minutes_played, is_substitute, goals, assists, shots_total, shots_on_target, passes_total, passes_key, passes_accuracy, tackles_total, tackles_interceptions, duels_total, duels_won, dribbles_attempts, dribbles_success, saves, goals_conceded"
  );
  console.log(`  ${statRows.length} spelar-match-rader.`);

  console.log("Läser spelarpositioner...");
  // VIKTIG BUGG FÅNGAD UNDER VERIFIERING: `player`-tabellen har 2305 rader
  // — ETT obegränsat .select() UTAN loadAll() trunkerade tyst till 1000 vid
  // första körningen (samma, redan flera gånger dokumenterade Supabase-
  // fallgrop) och tappade därmed E. BERISHA SJÄLV (id 7829, ett av de
  // senare/högre player_id-numren) ur hela analysen — precis den spelare
  // som motiverade hela undersökningen. Fixat med samma paginerade
  // loadAll() som redan används för fixture/fixture_player_stats.
  const playersRaw = await loadAll<{ id: number; position: string | null; full_name: string }>("player", "id, position, full_name");
  const positionByPlayer = new Map(playersRaw.map((p) => [p.id, p.position]));
  const nameByPlayer = new Map(playersRaw.map((p) => [p.id, p.full_name]));

  const { data: seasonsRaw } = await supabase.from("season").select("id, year");
  const yearBySeasonId = new Map((seasonsRaw ?? []).map((s) => [s.id, s.year]));

  console.log("Bygger kvalificerande prestationer...");
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
      isStarter: row.is_substitute === false,
      positionGroup: posGroupInfo.group,
      row,
    });
  }
  console.log(`  ${qualifying.length} kvalificerande prestationer (>=${MIN_MATCH_MINUTES} min).`);

  console.log("Räknar match-Performance (kausal peer-pool)...");
  const scored = computeMatchPerformances(qualifying);
  const withScore = scored.filter((s) => s.performance !== null);
  console.log(`  ${withScore.length} av ${scored.length} fick ett Performance-värde (resten: <4 kausala peers ännu).`);

  // Bygg per-spelare kronologiska sekvenser.
  const byPlayer = new Map<number, PerfWithScore[]>();
  for (const s of withScore) {
    const arr = byPlayer.get(s.playerId) ?? [];
    arr.push(s);
    byPlayer.set(s.playerId, arr);
  }
  for (const arr of byPlayer.values()) arr.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

  console.log(`\nSpelare med >=1 kvalificerande, poängsatt prestation: ${byPlayer.size}`);

  // Spara rådata för vidare analys-script (undviker att räkna om allt varje gång).
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });

  const exportable: Record<number, { name: string; obs: Observation[]; positionGroup: string }> = {};
  for (const [playerId, arr] of byPlayer) {
    exportable[playerId] = {
      name: nameByPlayer.get(playerId) ?? String(playerId),
      positionGroup: arr[0].positionGroup,
      obs: arr.map((a) => ({
        performance: a.performance!,
        minutes: a.minutes,
        seasonYear: yearBySeasonId.get(a.seasonId)!,
        kickoffAt: a.kickoffAt,
      })),
    };
  }
  fs.writeFileSync(path.join(outDir, "match-performances.json"), JSON.stringify(exportable));
  console.log(`\nSparat: scripts/research/output/match-performances.json (${Object.keys(exportable).length} spelare)`);
}

// Bara kör extraktionen om filen körs direkt (`npx tsx player-intelligence-backtest.ts`)
// — INTE när analyze.ts/validate.ts importerar de rena modellfunktionerna
// ovan, annars skulle varje analyssteg köra om hela dataextraktionen i onödan.
if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
