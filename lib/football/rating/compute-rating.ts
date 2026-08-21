import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, selectPeers, type PositionGroupInfo, type PositionGroupKey } from "../position-group";
import { tierFromThresholds, worseTier, type ConfidenceTier } from "../confidence";
import { aggregatePlayerSeasonStats, type PlayerSeasonAggregate } from "./rating-aggregates";
import { buildRatingCategories, type RatingCategory } from "./categories";
import type { RatingCategoryKey } from "./metric-registry";
import { computeOvr, type OvrContribution } from "./position-rating-config";

type Supabase = SupabaseClient<Database>;

/**
 * Player Rating — Level 5 orchestrator: kopplar ihop rating-aggregates.ts
 * (Level 1), categories.ts (Level 2–4) och position-rating-config.ts
 * (Level 5) till en färdig OVR per spelare. Samma peer-pool-urval och
 * konfidenströskellogik som player-dna.ts (selectPeers/tierFromThresholds/
 * worseTier, delade moduler nu — se ../position-group.ts och
 * ../confidence.ts), men poolat på BARA den valda säsongen (inte över alla
 * säsonger i ligan som DNA gör) — Rating svarar på "hur bra var den här
 * SÄSONGEN", DNA svarar på "vilken typ av spelare är det här" och drar
 * därför nytta av ett bredare, säsongsöverskridande underlag. En medveten
 * skillnad, inte en avvikelse av misstag.
 *
 * Målvakter hanteras INTE här — separat modell i goalkeeper-rating.ts
 * (planens steg 4). Tills den finns returnerar den här filen ett
 * `unavailable`-resultat för målvakter, exakt som player-dna.ts redan gör.
 */

export type OutfieldPositionGroup = Exclude<PositionGroupKey, "goalkeeper">;

export interface RatingConfidence {
  tier: ConfidenceTier;
  peerLabel: string;
  peerCount: number;
  ownMinutes: number;
  ownTier: ConfidenceTier;
  peerTier: ConfidenceTier;
  /** Minutgränsen som faktiskt tillämpades på peer-poolen — 0 om vi föll tillbaka pga litet underlag. */
  minMinutesApplied: number;
}

export interface PlayerRating {
  available: boolean;
  unavailableReason: string | null;
  /** 0–99, capad — null om helt otillgänglig. */
  ovr: number | null;
  positionGroup: OutfieldPositionGroup | null;
  categories: Record<RatingCategoryKey, RatingCategory> | null;
  /** Level 5-nedbrytningen: kategori → percentil-score → vikt → bidrag, för "varför X?"-vyn. */
  contributions: OvrContribution[];
  confidence: RatingConfidence | null;
  /** true om minst en kategori saknade underlag helt och vikterna fick skalas om (se position-rating-config.ts). */
  hadMissingCategory: boolean;
}

function unavailable(reason: string): PlayerRating {
  return {
    available: false,
    unavailableReason: reason,
    ovr: null,
    positionGroup: null,
    categories: null,
    contributions: [],
    confidence: null,
    hadMissingCategory: false,
  };
}

/** Peer-poolen som selectPeers kräver (`minutes_played`-fältnamnet) — mappad från vårt `minutesPlayed`. */
function toPeerShape(agg: PlayerSeasonAggregate): PlayerSeasonAggregate & { minutes_played: number } {
  return { ...agg, minutes_played: agg.minutesPlayed };
}

/**
 * Kärnberäkningen, delad mellan enskild-profil (computePlayerRating) och
 * batch (computeSeasonRatings) — samma peer-urval/konfidenslogik oavsett
 * anropssätt, ingen risk att de två vägarna tyst driver isär.
 */
function ratePlayer(
  player: PlayerSeasonAggregate,
  positionGroupInfo: PositionGroupInfo & { group: OutfieldPositionGroup },
  samePositionOthers: PlayerSeasonAggregate[]
): PlayerRating {
  const { peers, summary: peerSummary } = selectPeers(
    samePositionOthers.map(toPeerShape),
    positionGroupInfo.label,
    player.minutesPlayed
  );

  const categories = buildRatingCategories(player, peers);
  const categoryScores = Object.fromEntries(
    (Object.entries(categories) as [RatingCategoryKey, RatingCategory][]).map(([key, cat]) => [key, cat.score])
  ) as Record<RatingCategoryKey, number | null>;

  const { ovr, contributions, hadMissingCategory } = computeOvr(positionGroupInfo.group, categoryScores);

  const ownTier = tierFromThresholds(player.minutesPlayed, 900, 450);
  const peerTier = tierFromThresholds(peers.length, 12, 6);
  const confidence: RatingConfidence = {
    tier: worseTier(ownTier, peerTier),
    peerLabel: peerSummary.label,
    peerCount: peerSummary.count,
    ownMinutes: player.minutesPlayed,
    ownTier,
    peerTier,
    minMinutesApplied: peerSummary.minMinutesApplied,
  };

  return {
    available: true,
    unavailableReason: null,
    ovr,
    positionGroup: positionGroupInfo.group,
    categories,
    contributions,
    confidence,
    hadMissingCategory,
  };
}

async function resolveSeasonId(supabase: Supabase, year: number): Promise<number | null> {
  const { data: seasonRow, error } = await supabase.from("season").select("id").eq("year", year).maybeSingle();
  if (error) throw error;
  return seasonRow?.id ?? null;
}

/** Enskild spelarprofil — t.ex. /data/players/[id]. */
export async function computePlayerRating(
  supabase: Supabase,
  params: { playerId: number; season: number }
): Promise<PlayerRating> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  if (seasonId === null) return unavailable("Ingen data för den säsongen.");

  const aggregates = await aggregatePlayerSeasonStats(supabase, { seasonId });
  const player = aggregates.get(params.playerId);
  if (!player) return unavailable("Spelaren har ingen registrerad speltid den här säsongen.");

  const positionGroupInfo = getPositionGroup(player.position);
  if (!positionGroupInfo) return unavailable("Okänd position — kan inte bygga en positionsjusterad rating.");
  if (positionGroupInfo.group === "goalkeeper") {
    return unavailable("Målvakter har en separat ratingmodell (räddningsprocent/insläppta mål/clean sheets) — inte byggd ännu.");
  }

  const samePositionOthers = [...aggregates.values()].filter(
    (p) => p.playerId !== params.playerId && getPositionGroup(p.position)?.group === positionGroupInfo.group
  );

  return ratePlayer(player, positionGroupInfo as PositionGroupInfo & { group: OutfieldPositionGroup }, samePositionOthers);
}

/**
 * Hela ligans säsong i en batch (Scout-lista/topplista) — EN
 * aggregatePlayerSeasonStats-fråga, sedan ren JS-beräkning per spelare.
 * Ingen N+1-fråga mot databasen oavsett hur många spelare säsongen har.
 */
export async function computeSeasonRatings(supabase: Supabase, params: { season: number }): Promise<Map<number, PlayerRating>> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  const result = new Map<number, PlayerRating>();
  if (seasonId === null) return result;

  const aggregates = await aggregatePlayerSeasonStats(supabase, { seasonId });
  const all = [...aggregates.values()];

  for (const player of all) {
    const positionGroupInfo = getPositionGroup(player.position);
    if (!positionGroupInfo) {
      result.set(player.playerId, unavailable("Okänd position — kan inte bygga en positionsjusterad rating."));
      continue;
    }
    if (positionGroupInfo.group === "goalkeeper") {
      result.set(
        player.playerId,
        unavailable("Målvakter har en separat ratingmodell (räddningsprocent/insläppta mål/clean sheets) — inte byggd ännu.")
      );
      continue;
    }
    const samePositionOthers = all.filter(
      (p) => p.playerId !== player.playerId && getPositionGroup(p.position)?.group === positionGroupInfo.group
    );
    result.set(
      player.playerId,
      ratePlayer(player, positionGroupInfo as PositionGroupInfo & { group: OutfieldPositionGroup }, samePositionOthers)
    );
  }

  return result;
}
