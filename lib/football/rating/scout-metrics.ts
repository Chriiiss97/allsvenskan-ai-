import { percentile, invertedPercentile } from "../percentile";
import type { PlayerSeasonAggregate } from "./rating-aggregates";

/**
 * Scout Engine (2026-08-21) — mått som beräknas och SPARAS för Scout men
 * som INTE är en del av Player Ratings OVR-formel (lib/football/rating/
 * metric-registry.ts + position-rating-config.ts). Medvetet en separat fil:
 * att lägga till ett mått här ändrar aldrig en redan skeppad OVR-siffra,
 * till skillnad från att lägga till det i en OVR-kategori.
 *
 * Ett enda mått hittills: "dribblad förbi/90" (dribbles_past). Kandidaten
 * "blockerade skott/90" (tackles_blocks) uteslöts medvetet — bara 19 %
 * täckning 2024, under den lägsta redan accepterade nivån i Rating-mätten
 * (skott på mål, 22 %). Fler mått kan läggas till här allteftersom Scout
 * växer, utan att röra OVR-kategorierna.
 */

export interface ScoutOnlyMetricDefinition {
  key: string;
  /** Kort, vardagligt namn — se Scout:s allmänna princip om enkelt språk. */
  label: string;
  definition: string;
  unit: "/90" | "%";
  /** true om lägre värde är bättre (t.ex. "dribblad förbi") — styr vilken percentilriktning som används. */
  lowerIsBetter: boolean;
}

export const SCOUT_ONLY_METRICS: ScoutOnlyMetricDefinition[] = [
  {
    key: "dribblesPastPer90",
    label: "Dribblad förbi",
    definition: "Hur många gånger en motståndare dribblar förbi spelaren, per 90 minuter. Lägre är bättre — mest relevant för försvarare, men visas för alla utespelare.",
    unit: "/90",
    lowerIsBetter: true,
  },
];

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function extractScoutMetricValue(agg: PlayerSeasonAggregate, key: string): number | null {
  switch (key) {
    case "dribblesPastPer90":
      return agg.dribblesPast === null ? null : per90(agg.dribblesPast, agg.minutesPlayed);
    default:
      return null;
  }
}

/**
 * Samma "hoppa över, aldrig 0"-princip som categories.ts: ett mått saknas
 * helt i resultatet (inte 0) om spelaren eller alla peers saknar värde.
 * `peers` ska vara SAMMA redan positionsfiltrerade/minutgolv-filtrerade
 * pool som resten av Rating-systemet använder (selectPeers), inte en ny
 * urvalslogik.
 */
export function computeScoutOnlyMetrics(
  player: PlayerSeasonAggregate,
  peers: PlayerSeasonAggregate[]
): Record<string, { value: number; percentile: number }> {
  const result: Record<string, { value: number; percentile: number }> = {};

  for (const metric of SCOUT_ONLY_METRICS) {
    const playerValue = extractScoutMetricValue(player, metric.key);
    if (playerValue === null) continue;
    const peerValues = peers.map((p) => extractScoutMetricValue(p, metric.key)).filter((v): v is number => v !== null);
    if (peerValues.length === 0) continue;
    const pct = metric.lowerIsBetter ? invertedPercentile(playerValue, peerValues) : percentile(playerValue, peerValues);
    result[metric.key] = { value: playerValue, percentile: pct };
  }

  return result;
}
