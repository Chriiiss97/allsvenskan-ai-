import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, selectPeers, type PositionGroupKey } from "../position-group";
import { percentile } from "../percentile";
import { aggregatePlayerSeasonStats, type PlayerSeasonAggregate } from "./rating-aggregates";
import { aggregateAdvancedPlayerSeasonStats, type AdvancedPlayerSeasonAggregate } from "./advanced-rating-aggregates";
import { extractMetricValue, buildRatingCategories } from "./categories";
import { RATING_METRICS, type RatingCategoryKey } from "./metric-registry";
import { computeOvr, type OvrResult } from "./position-rating-config";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Fas 13 — Player Rating-JÄMFÖRELSEFÖRSLAG. Rent beslutsunderlag, INTE en
 * ändring av OVR-formeln.
 * ============================================================================
 * KRITISKT: den här filen har INGEN skrivväg till player_season_rating och
 * importerar/ändrar ALDRIG metric-registry.ts/categories.ts/
 * position-rating-config.ts/refresh-ratings.ts — den bara LÄSER
 * (importerar) redan existerande, oförändrade funktioner från dem
 * (extractMetricValue, computeOvr) för att återanvända EXAKT samma
 * percentil-/viktlogik som den riktiga OVR-formeln, tillämpad på en
 * FÖRESLAGEN, utökad kategori-sammansättning. Ingenting härifrån skrivs
 * någonsin till databasen. Bekräftat: tom diff på alla fyra skyddade filer
 * efter denna fas.
 *
 * Förslaget är MEDVETET litet och additivt — inte en omdesign av vikterna
 * (attacker/midfielder/defender-vikterna i position-rating-config.ts rörs
 * inte alls), bara ETT nytt mått per kategori (utom Dribbling, ingen stark
 * Sportmonks-kandidat hittades där):
 *   - Avslutning: + xG/90 (kvalitetsdimension, saknas helt i originalet)
 *   - Passning:   + Passningar sista tredjedel/90 (bollprogression)
 *   - Försvarsspel: + Luftduellandel (helt ny dueltyp, API-Football kan
 *     inte särskilja luftdueller från duels_total)
 *
 * Gäller BARA 2024–2026 (Sportmonks-täckning). Anropas ALDRIG automatiskt —
 * bara från admin-jämförelsevyn (app/(app)/admin/ovr-proposal/page.tsx),
 * en människa måste aktivt navigera dit för att se förslaget.
 */

interface ProposedAddition {
  key: string;
  label: string;
  category: RatingCategoryKey;
}

const PROPOSED_ADDITIONS: ProposedAddition[] = [
  { key: "xgPer90", label: "xG", category: "shooting" },
  { key: "passesFinalThirdPer90", label: "Passningar sista tredjedel", category: "passing" },
  { key: "aerialsWonPct", label: "Luftduellandel", category: "defending" },
];

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}
function pctOf(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(((numerator / denominator) * 100 + Number.EPSILON) * 10) / 10;
}

function extractAdditionValue(advanced: AdvancedPlayerSeasonAggregate | undefined, key: string): number | null {
  if (!advanced) return null;
  switch (key) {
    case "xgPer90":
      return per90(advanced.xg, advanced.minutesPlayed);
    case "passesFinalThirdPer90":
      return per90(advanced.passesFinalThird, advanced.minutesPlayed);
    case "aerialsWonPct":
      return pctOf(advanced.aerialsWonPaired, advanced.aerialsTotal);
    default:
      return null;
  }
}

interface PlayerPair {
  base: PlayerSeasonAggregate;
  advanced: AdvancedPlayerSeasonAggregate | undefined;
}

/** Kategori-percentiler byggda av ORIGINALETS mått (extractMetricValue, återanvänd oförändrad) PLUS de tre föreslagna tilläggen. */
function buildProposedCategoryScores(
  player: PlayerPair,
  peers: PlayerPair[]
): Record<RatingCategoryKey, number | null> {
  const categories: RatingCategoryKey[] = ["shooting", "passing", "dribbling", "defending"];
  const result = {} as Record<RatingCategoryKey, number | null>;

  for (const categoryKey of categories) {
    const percentiles: number[] = [];

    for (const metric of RATING_METRICS.filter((m) => m.category === categoryKey)) {
      const playerValue = extractMetricValue(player.base, metric.key);
      if (playerValue === null) continue;
      const peerValues = peers.map((p) => extractMetricValue(p.base, metric.key)).filter((v): v is number => v !== null);
      if (peerValues.length === 0) continue;
      percentiles.push(percentile(playerValue, peerValues));
    }

    for (const addition of PROPOSED_ADDITIONS.filter((a) => a.category === categoryKey)) {
      const playerValue = extractAdditionValue(player.advanced, addition.key);
      if (playerValue === null) continue;
      const peerValues = peers.map((p) => extractAdditionValue(p.advanced, addition.key)).filter((v): v is number => v !== null);
      if (peerValues.length === 0) continue;
      percentiles.push(percentile(playerValue, peerValues));
    }

    result[categoryKey] = percentiles.length > 0 ? Math.round(percentiles.reduce((a, b) => a + b, 0) / percentiles.length) : null;
  }

  return result;
}

export interface OvrProposalRow {
  playerId: number;
  fullName: string;
  positionGroup: Exclude<PositionGroupKey, "goalkeeper">;
  currentOvr: number | null;
  proposedOvr: number | null;
  delta: number | null;
  currentResult: OvrResult;
  proposedResult: OvrResult;
}

/**
 * Nuvarande OVR beräknas via EXAKT samma väg som produkten redan använder
 * (categories.ts:s buildRatingCategories + computeOvr, oförändrade) — ingen
 * separat, potentiellt avvikande omräkning. Föreslagen OVR använder samma
 * computeOvr men med den utökade kategori-sammansättningen ovan.
 */
export async function computeOvrProposalComparison(
  supabase: Supabase,
  params: { seasonYear: 2024 | 2025 | 2026 }
): Promise<OvrProposalRow[]> {
  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.seasonYear).maybeSingle();
  if (!seasonRow) return [];

  const [baseAggregates, advancedAggregates] = await Promise.all([
    aggregatePlayerSeasonStats(supabase, { seasonId: seasonRow.id }),
    aggregateAdvancedPlayerSeasonStats(supabase, { seasonId: seasonRow.id }),
  ]);

  const pairs = new Map<number, PlayerPair>();
  for (const [id, base] of baseAggregates) {
    pairs.set(id, { base, advanced: advancedAggregates.get(id) });
  }

  const rows: OvrProposalRow[] = [];
  for (const [playerId, pair] of pairs) {
    const positionGroupInfo = getPositionGroup(pair.base.position);
    if (!positionGroupInfo || positionGroupInfo.group === "goalkeeper") continue;
    const group = positionGroupInfo.group as Exclude<PositionGroupKey, "goalkeeper">;

    const samePositionOthers = [...pairs.values()].filter(
      (p) => p.base.playerId !== playerId && getPositionGroup(p.base.position)?.group === group
    );
    const { peers } = selectPeers(
      samePositionOthers.map((p) => ({ ...p, minutes_played: p.base.minutesPlayed })),
      positionGroupInfo.label,
      pair.base.minutesPlayed
    );

    // Nuvarande OVR: byggd genom att anropa den RIKTIGA, oförändrade
    // buildRatingCategories() (categories.ts) rakt av — inte en egen
    // omimplementation. Garanterar att "nuvarande"-sidan i jämförelsen
    // aldrig kan avvika från vad produkten faktiskt visar.
    const currentCategories = buildRatingCategories(
      pair.base,
      peers.map((p) => p.base)
    );
    const currentCategoryScores = {
      shooting: currentCategories.shooting.score,
      passing: currentCategories.passing.score,
      dribbling: currentCategories.dribbling.score,
      defending: currentCategories.defending.score,
    } satisfies Record<RatingCategoryKey, number | null>;

    const proposedCategoryScores = buildProposedCategoryScores(pair, peers);

    const currentResult = computeOvr(group, currentCategoryScores);
    const proposedResult = computeOvr(group, proposedCategoryScores);

    rows.push({
      playerId,
      fullName: pair.base.fullName,
      positionGroup: group,
      currentOvr: currentResult.ovr,
      proposedOvr: proposedResult.ovr,
      delta: currentResult.ovr !== null && proposedResult.ovr !== null ? proposedResult.ovr - currentResult.ovr : null,
      currentResult,
      proposedResult,
    });
  }

  return rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
}

export { PROPOSED_ADDITIONS };
