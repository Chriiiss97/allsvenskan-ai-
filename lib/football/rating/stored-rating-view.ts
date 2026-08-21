import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getStoredSeasonRatings } from "./rating-store";
import { RATING_METRICS, type RatingCategoryKey } from "./metric-registry";
import { computeOvr } from "./position-rating-config";
import { GOALKEEPER_WEIGHTS, GOALKEEPER_METRIC_LABELS, GOALKEEPER_METRIC_UNITS, applyGoalkeeperWeighting, type GoalkeeperMetricDetail } from "./goalkeeper-rating";
import { tierFromThresholds, worseTier } from "../confidence";
import { getPositionGroup } from "../position-group";
import type { AnyPlayerRating, PlayerRating, OutfieldPositionGroup } from "./compute-rating";
import type { GoalkeeperRating } from "./goalkeeper-rating";
import type { RatingCategory } from "./categories";

type Supabase = SupabaseClient<Database>;

/**
 * Scout Engine Fas 8 (prestanda) — bygger EXAKT samma AnyPlayerRating-form
 * som computeRatingForPlayer/computeGoalkeeperRating (compute-rating.ts/
 * goalkeeper-rating.ts), men UTAN att räkna om något. Allt kommer från det
 * redan sparade player_season_rating-facit (Fas 2/8) — en enda indexerad
 * fråga istället för en full ligasäsongs fixture_player_stats-paginering
 * (~9 500 rader) VARJE gång Scout:s detaljpanel öppnas för en ny spelare.
 *
 * Bygger vikter/kontributioner genom att ÅTERANVÄNDA computeOvr()
 * (position-rating-config.ts) och applyGoalkeeperWeighting()
 * (goalkeeper-rating.ts) — samma formler som den levande beräkningen,
 * inte en omskriven kopia som kan driva isär över tid.
 *
 * Returnerar `null` om spelaren saknar ett sparat facit den säsongen (t.ex.
 * innan `npm run import ratings` körts) — anroparen faller då tillbaka på
 * den levande beräkningen (se app/(app)/data/scout/page.tsx), aldrig en
 * tyst felaktig siffra.
 *
 * Medvetet UTANFÖR scope: den fulla profilsidan (/data/players/[id])
 * fortsätter använda den levande beräkningen oförändrat — en enskild,
 * avsiktlig sidvisning är inte samma prestandaproblem som Scout:s
 * snabba klick-genom-flera-kandidater-flöde, och att röra en redan
 * skeppad, verifierad sida i en prestandaomgång vore onödig risk.
 */
export async function getStoredPlayerRatingView(
  supabase: Supabase,
  params: { playerId: number; seasonId: number; position: string | null }
): Promise<AnyPlayerRating | null> {
  const positionGroupInfo = getPositionGroup(params.position);
  if (!positionGroupInfo) return null;

  const rows = await getStoredSeasonRatings(supabase, params.seasonId);
  const row = rows?.find((r) => r.playerId === params.playerId);
  if (!row || row.metricValues === null) return null;

  const ownTier = tierFromThresholds(row.ownMinutes, 900, 450);
  const peerTier = tierFromThresholds(row.peerCount ?? 0, 12, 6);
  const confidenceTier = row.confidenceTier ?? worseTier(ownTier, peerTier);

  if (positionGroupInfo.group === "goalkeeper") {
    const metrics: GoalkeeperMetricDetail[] = [];
    for (const key of Object.keys(GOALKEEPER_WEIGHTS) as (keyof typeof GOALKEEPER_WEIGHTS)[]) {
      const stored = row.metricValues[key];
      if (!stored) continue;
      metrics.push({
        key,
        label: GOALKEEPER_METRIC_LABELS[key],
        playerValue: stored.value,
        peerAverage: stored.peerAverage,
        percentile: stored.percentile,
        weight: GOALKEEPER_WEIGHTS[key],
        contribution: 0, // fylls i av applyGoalkeeperWeighting nedan
        unit: GOALKEEPER_METRIC_UNITS[key],
      });
    }
    applyGoalkeeperWeighting(metrics);
    const ovr = metrics.length > 0 ? Math.min(99, Math.round(metrics.reduce((a, d) => a + d.contribution, 0))) : row.ovr;

    const rating: GoalkeeperRating = {
      available: true,
      unavailableReason: null,
      ovr,
      metrics,
      confidence: {
        tier: confidenceTier,
        peerLabel: positionGroupInfo.label,
        peerCount: row.peerCount ?? 0,
        ownMinutes: row.ownMinutes,
        ownTier,
        peerTier,
        minMinutesApplied: 450,
      },
    };
    return { kind: "goalkeeper", rating };
  }

  if (!row.categoryScores) return null;
  const group = positionGroupInfo.group as OutfieldPositionGroup;
  const { ovr, contributions } = computeOvr(group, row.categoryScores as Record<RatingCategoryKey, number | null>);

  const categories = {} as Record<RatingCategoryKey, RatingCategory>;
  for (const [categoryKey, score] of Object.entries(row.categoryScores) as [RatingCategoryKey, number][]) {
    const metricsInCategory = RATING_METRICS.filter((m) => m.category === categoryKey);
    const metrics = metricsInCategory
      .map((def) => {
        const stored = row.metricValues![def.key];
        if (!stored) return null;
        return { key: def.key, label: def.label, playerValue: stored.value, peerAverage: stored.peerAverage, percentile: stored.percentile, unit: def.unit };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    categories[categoryKey] = { score, metrics };
  }

  const rating: PlayerRating = {
    available: true,
    unavailableReason: null,
    ovr,
    positionGroup: group,
    categories,
    contributions,
    confidence: {
      tier: confidenceTier,
      peerLabel: positionGroupInfo.label,
      peerCount: row.peerCount ?? 0,
      ownMinutes: row.ownMinutes,
      ownTier,
      peerTier,
      minMinutesApplied: 450,
    },
    hadMissingCategory: contributions.some((c) => c.score === null),
  };
  return { kind: "outfield", rating };
}
