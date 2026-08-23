import { percentile, invertedPercentile } from "../percentile";
import { ADVANCED_RATING_METRICS, type AdvancedRatingCategoryKey } from "./advanced-metric-registry";
import type { AdvancedPlayerSeasonAggregate } from "./advanced-rating-aggregates";

/**
 * Fas 8 — Level 2–4 för det avancerade registret. Samma
 * buildMetric/buildCategory-mönster som categories.ts (score = medel av
 * measurens percentiler), men EGEN fil eftersom categories.ts:s
 * extractMetricValue()/buildRatingCategories() inte stödjer
 * lowerIsBetter-riktning per mått — att lägga till det där hade rört en
 * fil som matar OVR-formeln. Denna fil importeras ALDRIG av
 * OVR-motorn i lib/ovr/.
 */

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(((numerator / denominator) * 100 + Number.EPSILON) * 10) / 10;
}

export function extractAdvancedMetricValue(agg: AdvancedPlayerSeasonAggregate, key: string): number | null {
  switch (key) {
    case "xgPer90":
      return per90(agg.xg, agg.minutesPlayed);
    case "xgotPer90":
      return per90(agg.xgot, agg.minutesPlayed);
    case "passesFinalThirdPer90":
      return per90(agg.passesFinalThird, agg.minutesPlayed);
    case "chancesCreatedPer90":
      return per90(agg.chancesCreated, agg.minutesPlayed);
    case "longBallsPer90":
      return per90(agg.longBalls, agg.minutesPlayed);
    case "longBallsWonPct":
      return pct(agg.longBallsWonPaired, agg.longBalls);
    case "possessionLostPer90":
      return per90(agg.possessionLost, agg.minutesPlayed);
    case "touchesPer90":
      return per90(agg.touches, agg.minutesPlayed);
    case "dispossessedPer90":
      return per90(agg.dispossessed, agg.minutesPlayed);
    case "ballRecoveryPer90":
      return per90(agg.ballRecovery, agg.minutesPlayed);
    case "tacklesWonPer90":
      return per90(agg.tacklesWon, agg.minutesPlayed);
    case "aerialsWonPer90":
      return per90(agg.aerialsWon, agg.minutesPlayed);
    case "aerialsWonPct":
      return pct(agg.aerialsWonPaired, agg.aerialsTotal);
    case "clearancesPer90":
      return per90(agg.clearances, agg.minutesPlayed);
    default:
      return null;
  }
}

export interface AdvancedRatingMetricDetail {
  key: string;
  label: string;
  playerValue: number;
  peerAverage: number;
  percentile: number;
  unit: "/90" | "%";
  lowerIsBetter: boolean;
}

export interface AdvancedRatingCategory {
  /** null om inget av kategorins mått gick att beräkna för spelaren — aldrig 0. */
  score: number | null;
  metrics: AdvancedRatingMetricDetail[];
}

const CATEGORY_KEYS: AdvancedRatingCategoryKey[] = ["shooting", "passing", "dribbling", "defending"];

/**
 * Bygger de fyra avancerade kategorierna för EN spelare mot en redan
 * positionsfiltrerad peer-mängd (samma selectPeers-urval som resten av
 * Rating-systemet — anroparen ansvarar för filtreringen, denna fil vet
 * inget om positioner).
 */
export function buildAdvancedRatingCategories(
  player: AdvancedPlayerSeasonAggregate,
  peers: AdvancedPlayerSeasonAggregate[]
): Record<AdvancedRatingCategoryKey, AdvancedRatingCategory> {
  const result = {} as Record<AdvancedRatingCategoryKey, AdvancedRatingCategory>;

  for (const categoryKey of CATEGORY_KEYS) {
    const metricsInCategory = ADVANCED_RATING_METRICS.filter((m) => m.category === categoryKey);
    const details: AdvancedRatingMetricDetail[] = [];

    for (const metric of metricsInCategory) {
      const playerValue = extractAdvancedMetricValue(player, metric.key);
      if (playerValue === null) continue;

      const peerValues = peers.map((p) => extractAdvancedMetricValue(p, metric.key)).filter((v): v is number => v !== null);
      if (peerValues.length === 0) continue;

      const pctScore = metric.lowerIsBetter ? invertedPercentile(playerValue, peerValues) : percentile(playerValue, peerValues);

      details.push({
        key: metric.key,
        label: metric.label,
        playerValue,
        peerAverage: Math.round(((peerValues.reduce((a, b) => a + b, 0) / peerValues.length) + Number.EPSILON) * 10) / 10,
        percentile: pctScore,
        unit: metric.unit,
        lowerIsBetter: metric.lowerIsBetter,
      });
    }

    const score = details.length > 0 ? Math.round(details.reduce((a, d) => a + d.percentile, 0) / details.length) : null;
    result[categoryKey] = { score, metrics: details };
  }

  return result;
}
