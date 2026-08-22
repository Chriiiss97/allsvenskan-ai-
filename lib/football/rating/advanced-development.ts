import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, selectPeers, type PositionGroupKey } from "../position-group";
import { aggregateAdvancedPlayerSeasonStats, type AdvancedPlayerSeasonAggregate } from "./advanced-rating-aggregates";
import { buildAdvancedRatingCategories, type AdvancedRatingCategory } from "./advanced-categories";
import { ADVANCED_RATING_CATEGORY_LABELS, type AdvancedRatingCategoryKey } from "./advanced-metric-registry";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 12 — Development-analys: "varför", inte bara siffra. Ny fil, rör
 * INTE rating-trend.ts (den befintliga OVR-trenden, som fortsätter fungera
 * oförändrat — bekräftat via tom diff). Detta är ett KOMPLEMENT: jämför
 * Fas 8:s per-säsongs avancerade kategori-/måttpercentiler mellan två
 * Sportmonks-täckta säsonger (2024/2025/2026) och pekar ut vilket
 * underliggande mått som faktiskt drev en förändring — spårbart till
 * riktiga tal, ingen gissning om ORSAK bakom en OVR-siffra.
 *
 * Kräver att spelaren har avancerad täckning i MINST TVÅ av de tre
 * Sportmonks-säsongerna — annars finns ingen säsong-till-säsong-jämförelse
 * att göra (unavailable, döljs helt av UI:t, samma princip som Fas 9).
 */

export interface AdvancedMetricDelta {
  key: string;
  label: string;
  categoryKey: AdvancedRatingCategoryKey;
  valueA: number;
  valueB: number;
  percentileA: number;
  percentileB: number;
  percentileDelta: number;
  unit: "/90" | "%";
}

export interface AdvancedCategoryDelta {
  key: AdvancedRatingCategoryKey;
  label: string;
  scoreA: number | null;
  scoreB: number | null;
  delta: number | null;
}

export interface AdvancedDevelopmentSummary {
  available: boolean;
  unavailableReason: string | null;
  seasonAYear: number | null;
  seasonBYear: number | null;
  categoryDeltas: AdvancedCategoryDelta[];
  /** Det enskilda måttet (bland alla kategorier) med störst percentilförändring — "vad drev det". */
  biggestMover: AdvancedMetricDelta | null;
  whyText: string | null;
}

function unavailable(reason: string): AdvancedDevelopmentSummary {
  return {
    available: false,
    unavailableReason: reason,
    seasonAYear: null,
    seasonBYear: null,
    categoryDeltas: [],
    biggestMover: null,
    whyText: null,
  };
}

async function buildCategoriesForSeason(
  supabase: Supabase,
  seasonId: number,
  playerId: number
): Promise<{ categories: Record<AdvancedRatingCategoryKey, AdvancedRatingCategory>; positionGroup: PositionGroupKey } | null> {
  const aggregates = await aggregateAdvancedPlayerSeasonStats(supabase, { seasonId });
  const player = aggregates.get(playerId);
  if (!player) return null;

  const positionGroupInfo = getPositionGroup(player.position);
  if (!positionGroupInfo || positionGroupInfo.group === "goalkeeper") return null;

  const samePositionOthers = [...aggregates.values()].filter(
    (p) => p.playerId !== playerId && getPositionGroup(p.position)?.group === positionGroupInfo.group
  );
  const { peers } = selectPeers(
    samePositionOthers.map((p): AdvancedPlayerSeasonAggregate & { minutes_played: number } => ({ ...p, minutes_played: p.minutesPlayed })),
    positionGroupInfo.label,
    player.minutesPlayed
  );

  return { categories: buildAdvancedRatingCategories(player, peers), positionGroup: positionGroupInfo.group };
}

/**
 * Jämför de TVÅ SENASTE Sportmonks-täckta säsongerna spelaren har
 * avancerad data för (bland 2024/2025/2026) — samma "senaste vs föregående"
 * princip som rating-trend.ts redan använder för OVR.
 */
export async function computeAdvancedDevelopment(
  supabase: Supabase,
  params: { playerId: number }
): Promise<AdvancedDevelopmentSummary> {
  const { data: seasons, error } = await supabase.from("season").select("id, year").in("year", [2024, 2025, 2026]).order("year", { ascending: true });
  if (error) throw error;
  if (!seasons || seasons.length < 2) return unavailable("Otillräckligt med Sportmonks-täckta säsonger i databasen.");

  // Hitta vilka av de tre säsongerna spelaren faktiskt har avancerad täckning i.
  const covered: { year: number; seasonId: number; categories: Record<AdvancedRatingCategoryKey, AdvancedRatingCategory> }[] = [];
  let positionGroup: PositionGroupKey | null = null;
  for (const s of seasons) {
    const result = await buildCategoriesForSeason(supabase, s.id, params.playerId);
    if (result) {
      covered.push({ year: s.year, seasonId: s.id, categories: result.categories });
      positionGroup = result.positionGroup;
    }
  }

  if (covered.length < 2) {
    return unavailable(
      covered.length === 0
        ? "Spelaren saknar avancerad Sportmonks-täckning."
        : "Spelaren har avancerad täckning i bara en säsong — ingen jämförelse att göra än."
    );
  }
  if (!positionGroup) return unavailable("Okänd position.");

  covered.sort((a, b) => a.year - b.year);
  const seasonA = covered[covered.length - 2];
  const seasonB = covered[covered.length - 1];

  const categoryKeys = Object.keys(ADVANCED_RATING_CATEGORY_LABELS) as AdvancedRatingCategoryKey[];
  const categoryDeltas: AdvancedCategoryDelta[] = categoryKeys.map((key) => {
    const scoreA = seasonA.categories[key]?.score ?? null;
    const scoreB = seasonB.categories[key]?.score ?? null;
    return {
      key,
      label: ADVANCED_RATING_CATEGORY_LABELS[key],
      scoreA,
      scoreB,
      delta: scoreA !== null && scoreB !== null ? scoreB - scoreA : null,
    };
  });

  // Störst enskild måttförändring, bland ALLA kategorier — samma metrics-nyckel måste finnas i båda säsongerna.
  let biggestMover: AdvancedMetricDelta | null = null;
  for (const key of categoryKeys) {
    const metricsA = seasonA.categories[key]?.metrics ?? [];
    const metricsB = seasonB.categories[key]?.metrics ?? [];
    for (const mB of metricsB) {
      const mA = metricsA.find((m) => m.key === mB.key);
      if (!mA) continue;
      const percentileDelta = mB.percentile - mA.percentile;
      if (!biggestMover || Math.abs(percentileDelta) > Math.abs(biggestMover.percentileDelta)) {
        biggestMover = {
          key: mB.key,
          label: mB.label,
          categoryKey: key,
          valueA: mA.playerValue,
          valueB: mB.playerValue,
          percentileA: mA.percentile,
          percentileB: mB.percentile,
          percentileDelta,
          unit: mB.unit,
        };
      }
    }
  }

  let whyText: string | null = null;
  if (biggestMover && Math.abs(biggestMover.percentileDelta) >= 15) {
    const direction = biggestMover.percentileDelta > 0 ? "förbättrats" : "försämrats";
    whyText = `Störst förändring: ${biggestMover.label.toLowerCase()} har ${direction} från ${biggestMover.valueA}${biggestMover.unit} (percentil ${biggestMover.percentileA}) till ${biggestMover.valueB}${biggestMover.unit} (percentil ${biggestMover.percentileB}) mellan ${seasonA.year} och ${seasonB.year} — en driver bakom förändringen i ${ADVANCED_RATING_CATEGORY_LABELS[biggestMover.categoryKey].toLowerCase()}.`;
  }

  return {
    available: true,
    unavailableReason: null,
    seasonAYear: seasonA.year,
    seasonBYear: seasonB.year,
    categoryDeltas,
    biggestMover,
    whyText,
  };
}
