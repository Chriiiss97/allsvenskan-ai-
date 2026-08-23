import { percentile, invertedPercentile } from "../percentile";
import type { PlayerSeasonAggregate } from "./rating-aggregates";
import type { AdvancedPlayerSeasonAggregate } from "./advanced-rating-aggregates";

/**
 * Fas 11 — avancerade Scout-mått (Sportmonks). Samma filnivå-separations-
 * princip som scout-metrics.ts (mått som syns i Scout men INTE är en del
 * av OVR-formeln) — men EGEN fil, egen källa. scout-metrics.ts rörs inte
 * alls (bekräftat: tom diff efter denna fas).
 *
 * VIKTIGT: till skillnad från scout-metrics.ts:s SCOUT_ONLY_METRICS (som
 * skrivs in i player_ratings via refresh-ovr.ts) PERSISTERAS
 * dessa mått ALDRIG. refresh-ovr.ts står på listan över filer som
 * aldrig får referera en Sportmonks-källa förrän Fas 13 är explicit
 * godkänd — dessa mått beräknas därför COMPUTE-ON-READ (samma princip som
 * advanced-dna.ts/advanced-archetypes.ts), inte batch-förberäknat.
 *
 * "Mål − xG" (den mest efterfrågade av de här måtten) kräver BÅDA
 * aggregaten samtidigt (goals kommer från den vanliga fixture_player_stats-
 * källan, xg från Sportmonks) — det enda måttet i hela Sportmonks-lagret
 * som medvetet blandar de två källorna, eftersom "överpresterar sitt xG"
 * bara går att räkna ut på det sättet. Uttryckt som ett SÄSONGSTOTALT
 * måltal (inte per-90) — samma konvention som xG-overperformance normalt
 * rapporteras i fotbollsanalys.
 *
 * Big Chances Created/90 har medvetet låg täckning (14,0 % — samma siffra
 * som redan dokumenterad i advanced-metric-registry.ts, varför måttet
 * uteslöts DÄRIFRÅN). Här inkluderas det ändå, med samma lägre bevisbörda
 * som redan gäller scout-metrics.ts:s befintliga dribblesPastPer90
 * (34 % täckning 2024) — Scout-mått har alltid tolererat glesare data än
 * OVR/DNA-kategorier, eftersom de aldrig påverkar en sammanvägd poäng.
 */

export interface AdvancedScoutMetricDefinition {
  key: string;
  label: string;
  definition: string;
  unit: "/90" | "%" | "mål";
  lowerIsBetter: boolean;
  coverageNote: string;
}

export const ADVANCED_SCOUT_METRICS: AdvancedScoutMetricDefinition[] = [
  {
    key: "goalsMinusXg",
    label: "Mål − xG",
    definition: "Skillnaden mellan gjorda mål och sammanlagd xG under säsongen — positivt värde betyder att spelaren gjort fler mål än målchanserna statistiskt sett borde ge (avslutningskvalitet eller tur), negativt att spelaren underpresterat sina chanser.",
    unit: "mål",
    lowerIsBetter: false,
    coverageNote: "Kräver både goals (fixture_player_stats) och xg (Sportmonks) — bara spelare med minst ett registrerat avslut i båda källorna får ett värde.",
  },
  {
    key: "xgPer90",
    label: "xG",
    definition: "Expected Goals per 90 minuter.",
    unit: "/90",
    lowerIsBetter: false,
    coverageNote: "46,7 % (samma som advanced-metric-registry.ts — samma underliggande fält, men visas här som ett fristående Scout-filtrerbart mått).",
  },
  {
    key: "touchesPer90",
    label: "Bollberöringar",
    definition: "Antal bollberöringar per 90 minuter.",
    unit: "/90",
    lowerIsBetter: false,
    coverageNote: "84,6 %.",
  },
  {
    key: "ballRecoveryPer90",
    label: "Bollåtervinningar",
    definition: "Antal bollåtervinningar per 90 minuter.",
    unit: "/90",
    lowerIsBetter: false,
    coverageNote: "56,2 %.",
  },
  {
    key: "aerialsWonPct",
    label: "Luftduellandel",
    definition: "Andel vunna luftdueller, volymviktat över säsongen.",
    unit: "%",
    lowerIsBetter: false,
    coverageNote: "19,0 % — lägst täckta måttet i hela Sportmonks-lagret, men unikt (ingen annan källa mäter luftduellandel).",
  },
  {
    key: "bigChancesCreatedPer90",
    label: "Stora målchanser skapade",
    definition: "Situationer med hög målsannolikhet spelaren var direkt inblandad i att skapa, per 90 minuter — snävare och mer kvalitetsfokuserat än 'målchanser skapade' i det avancerade DNA-lagret.",
    unit: "/90",
    lowerIsBetter: false,
    coverageNote: "14,0 % — glest, samma lägre bevisbörda som befintlig dribblesPastPer90 (34 %) i scout-metrics.ts.",
  },
];

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(((numerator / denominator) * 100 + Number.EPSILON) * 10) / 10;
}

export interface AdvancedScoutPlayerData {
  base: PlayerSeasonAggregate | undefined;
  advanced: AdvancedPlayerSeasonAggregate | undefined;
  bigChancesCreated: number | undefined; // separat, se not i extractAdvancedScoutMetricValue
}

/**
 * bigChancesCreated ligger INTE på AdvancedPlayerSeasonAggregate (Fas 8
 * valde bort måttet ur den centrala aggregaten pga låg täckning) — hämtas
 * separat av anroparen direkt ur fixture_player_advanced_stats när detta
 * mått efterfrågas. Se scripts-sidan/UI-anropskoden (Fas 14) för mönstret.
 */
function extractAdvancedScoutMetricValue(data: AdvancedScoutPlayerData, key: string): number | null {
  const { base, advanced } = data;
  switch (key) {
    case "goalsMinusXg":
      if (!base || !advanced || advanced.xg === 0) return null;
      return Math.round((base.goals - advanced.xg + Number.EPSILON) * 10) / 10;
    case "xgPer90":
      if (!advanced) return null;
      return per90(advanced.xg, advanced.minutesPlayed);
    case "touchesPer90":
      if (!advanced) return null;
      return per90(advanced.touches, advanced.minutesPlayed);
    case "ballRecoveryPer90":
      if (!advanced) return null;
      return per90(advanced.ballRecovery, advanced.minutesPlayed);
    case "aerialsWonPct":
      if (!advanced) return null;
      return pct(advanced.aerialsWonPaired, advanced.aerialsTotal);
    case "bigChancesCreatedPer90":
      if (!advanced || data.bigChancesCreated === undefined) return null;
      return per90(data.bigChancesCreated, advanced.minutesPlayed);
    default:
      return null;
  }
}

/**
 * Compute-on-read, samma "hoppa över, aldrig 0"-princip som
 * scout-metrics.ts. `peers` ska vara samma redan positions-/minutgolv-
 * filtrerade pool som resten av Sportmonks-lagret använder.
 */
export function computeAdvancedScoutMetrics(
  player: AdvancedScoutPlayerData,
  peers: AdvancedScoutPlayerData[]
): Record<string, { value: number; percentile: number }> {
  const result: Record<string, { value: number; percentile: number }> = {};

  for (const metric of ADVANCED_SCOUT_METRICS) {
    const playerValue = extractAdvancedScoutMetricValue(player, metric.key);
    if (playerValue === null) continue;
    const peerValues = peers.map((p) => extractAdvancedScoutMetricValue(p, metric.key)).filter((v): v is number => v !== null);
    if (peerValues.length === 0) continue;
    const pctScore = metric.lowerIsBetter ? invertedPercentile(playerValue, peerValues) : percentile(playerValue, peerValues);
    result[metric.key] = { value: playerValue, percentile: pctScore };
  }

  return result;
}
