import { percentile } from "../percentile";
import { RATING_METRICS, type RatingCategoryKey } from "./metric-registry";
import type { PlayerSeasonAggregate } from "./rating-aggregates";

/**
 * Player Rating — Level 2–4: normaliserade mått → percentiler → kategori-
 * poäng. Samma `buildMetric`/`buildCategory`-mönster som
 * lib/football/player-dna.ts (score = medel av measurens percentiler),
 * men på en peer-mängd som ANROPAREN redan har positionsfiltrerat (via
 * lib/football/position-group.ts:s selectPeers, precis som player-dna.ts
 * själv gör) — den här filen vet inget om positioner, bara mått.
 */

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(((numerator / denominator) * 100 + Number.EPSILON) * 10) / 10;
}

/** Läser ut ett måtts faktiska värde ur ett säsongsaggregat, per metric-nyckel i metric-registry.ts. */
export function extractMetricValue(agg: PlayerSeasonAggregate, key: string): number | null {
  switch (key) {
    case "goalsPer90":
      return per90(agg.goals, agg.minutesPlayed);
    case "shotsTotalPer90":
      return per90(agg.shotsTotal, agg.minutesPlayed);
    case "shotsOnTargetPer90":
      return per90(agg.shotsOnTarget, agg.minutesPlayed);
    case "passesTotalPer90":
      return per90(agg.passesTotal, agg.minutesPlayed);
    case "passesAccuracyPct":
      return agg.passesAccuracyPct;
    case "passesKeyPer90":
      return per90(agg.passesKey, agg.minutesPlayed);
    case "assistsPer90":
      return per90(agg.assists, agg.minutesPlayed);
    case "dribblesAttemptsPer90":
      return per90(agg.dribblesAttempts, agg.minutesPlayed);
    case "dribblesSuccessPer90":
      return per90(agg.dribblesSuccess, agg.minutesPlayed);
    case "dribblesSuccessPct":
      return pct(agg.dribblesSuccess, agg.dribblesAttempts);
    case "tacklesTotalPer90":
      return per90(agg.tacklesTotal, agg.minutesPlayed);
    case "interceptionsPer90":
      return per90(agg.tacklesInterceptions, agg.minutesPlayed);
    case "duelsWonPer90":
      return per90(agg.duelsWon, agg.minutesPlayed);
    case "duelsWonPct":
      return pct(agg.duelsWon, agg.duelsTotal);
    default:
      return null;
  }
}

export interface RatingMetricDetail {
  key: string;
  label: string;
  playerValue: number;
  peerAverage: number;
  percentile: number;
  unit: "/90" | "%";
}

export interface RatingCategory {
  /** null om inget av kategorins mått gick att beräkna för spelaren — aldrig 0. */
  score: number | null;
  metrics: RatingMetricDetail[];
}

const OUTFIELD_CATEGORY_KEYS: RatingCategoryKey[] = ["shooting", "passing", "dribbling", "defending"];

/**
 * Bygger de fyra utespelarkategorierna för EN spelare mot en redan
 * positionsfiltrerad peer-mängd. Ett mått hoppas helt över (inte 0) om
 * spelaren saknar värde ELLER om ingen peer har ett jämförbart värde.
 */
export function buildRatingCategories(
  player: PlayerSeasonAggregate,
  peers: PlayerSeasonAggregate[]
): Record<RatingCategoryKey, RatingCategory> {
  const result = {} as Record<RatingCategoryKey, RatingCategory>;

  for (const categoryKey of OUTFIELD_CATEGORY_KEYS) {
    const metricsInCategory = RATING_METRICS.filter((m) => m.category === categoryKey);
    const details: RatingMetricDetail[] = [];

    for (const metric of metricsInCategory) {
      const playerValue = extractMetricValue(player, metric.key);
      if (playerValue === null) continue;

      const peerValues = peers.map((p) => extractMetricValue(p, metric.key)).filter((v): v is number => v !== null);
      if (peerValues.length === 0) continue;

      details.push({
        key: metric.key,
        label: metric.label,
        playerValue,
        peerAverage: Math.round(((peerValues.reduce((a, b) => a + b, 0) / peerValues.length) + Number.EPSILON) * 10) / 10,
        percentile: percentile(playerValue, peerValues),
        unit: metric.unit,
      });
    }

    const score = details.length > 0 ? Math.round(details.reduce((a, d) => a + d.percentile, 0) / details.length) : null;
    result[categoryKey] = { score, metrics: details };
  }

  return result;
}
