import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, selectPeers } from "../position-group";
import { tierFromThresholds, worseTier, type ConfidenceTier } from "../confidence";
import { percentile } from "../percentile";
import { aggregatePlayerSeasonStats, type PlayerSeasonAggregate } from "./rating-aggregates";

type Supabase = SupabaseClient<Database>;

/**
 * Player Rating — MÅLVAKTSMODELL, helt separat från utespelarnas
 * shooting/passing/dribbling/defending (metric-registry.ts/categories.ts
 * vet inget om målvakter, och tvärtom). En målvakts jobb mäts inte med
 * samma mått som en utespelares — att tvinga in "tacklingar/90" på en
 * målvakt (som nästan aldrig tacklar) hade varit precis den sortens
 * missvisande poolblandning position-group.ts:s egen filbeskrivning
 * varnar för.
 *
 * Tre mått, allihop med genuint stöd i fixture_player_stats (saves 91,9 %
 * täckning 2024, se rating-aggregates.ts):
 *
 * 1. Räddningsprocent = saves / (saves + goals_conceded) × 100 — hur stor
 *    andel av motståndarens skott på mål som stoppades. Standardmåttet i
 *    branschen (samma definition som t.ex. FBref/Opta använder).
 * 2. Insläppta mål/90 = goals_conceded / minutes_played × 90 — LÄGRE är
 *    bättre, så percentilen INVERTERAS (se invertedPercentile nedan) i
 *    motsats till alla andra mått i hela Rating-systemet där högre alltid
 *    är bättre.
 * 3. Clean sheet-andel = matcher med goals_conceded=0 OCH minutes_played≥60
 *    (en etablerad branschkonvention för att kreditera en clean sheet —
 *    inte ett påhittat tal) / matcher med minutes_played≥60 × 100.
 *
 * INGEN xG/skott-emot-data på spelarnivå finns (se planens databegränsning
 * 1) — räddningsprocent kan alltså inte justeras för skottkvalitet
 * (Post-Shot xG-Räddningar, PSxG-GA, finns inte i vårt datalager). En
 * dokumenterad begränsning, inte dold.
 */

export const GOALKEEPER_WEIGHTS = {
  savePct: 45,
  goalsConcededPer90: 35,
  cleanSheetPct: 20,
} as const;

function assertGkWeightsSumTo100() {
  const sum = Object.values(GOALKEEPER_WEIGHTS).reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`goalkeeper-rating.ts: GOALKEEPER_WEIGHTS summerar till ${sum}, inte 100.`);
}
assertGkWeightsSumTo100();

const OVR_CAP = 99;

export interface GoalkeeperMetricDetail {
  key: keyof typeof GOALKEEPER_WEIGHTS;
  label: string;
  playerValue: number;
  peerAverage: number;
  /** Redan invertering-korrigerad för goalsConcededPer90 — högre är ALLTID bättre här, som för alla andra mått. */
  percentile: number;
  weight: number;
  contribution: number;
  unit: "/90" | "%";
}

export interface GoalkeeperConfidence {
  tier: ConfidenceTier;
  /** Alltid "målvakter" — fältet finns för att spegla RatingConfidence:s form 1:1 i UI-koden. */
  peerLabel: string;
  peerCount: number;
  ownMinutes: number;
  ownTier: ConfidenceTier;
  peerTier: ConfidenceTier;
  minMinutesApplied: number;
}

export interface GoalkeeperRating {
  available: boolean;
  unavailableReason: string | null;
  ovr: number | null;
  metrics: GoalkeeperMetricDetail[];
  confidence: GoalkeeperConfidence | null;
}

function unavailable(reason: string): GoalkeeperRating {
  return { available: false, unavailableReason: reason, ovr: null, metrics: [], confidence: null };
}

function savePct(agg: PlayerSeasonAggregate): number | null {
  const denom = agg.saves + agg.goalsConceded;
  if (denom === 0) return null;
  return Math.round(((agg.saves / denom) * 100 + Number.EPSILON) * 10) / 10;
}

function goalsConcededPer90(agg: PlayerSeasonAggregate): number | null {
  if (agg.minutesPlayed <= 0) return null;
  return Math.round(((agg.goalsConceded / agg.minutesPlayed) * 90 + Number.EPSILON) * 10) / 10;
}

function cleanSheetPct(agg: PlayerSeasonAggregate): number | null {
  if (agg.matchesWithMin60 === 0) return null;
  return Math.round(((agg.cleanSheetMatches / agg.matchesWithMin60) * 100 + Number.EPSILON) * 10) / 10;
}

/**
 * Percentil för ett mått där LÄGRE värde är bättre (insläppta mål/90) —
 * andelen peers med LIKA HÖGT ELLER HÖGRE (alltså sämre eller lika) värde.
 * Negerar båda sidor och återanvänder samma percentile()-formel istället
 * för att duplicera logiken — "andel peers med -peerValue ≤ -spelarens" är
 * matematiskt identiskt med "andel peers med peerValue ≥ spelarens".
 */
function invertedPercentile(value: number, peerValues: number[]): number {
  return percentile(-value, peerValues.map((v) => -v));
}

function rateGoalkeeper(player: PlayerSeasonAggregate, peers: PlayerSeasonAggregate[]): GoalkeeperMetricDetail[] {
  const details: GoalkeeperMetricDetail[] = [];

  const playerSavePct = savePct(player);
  if (playerSavePct !== null) {
    const peerValues = peers.map(savePct).filter((v): v is number => v !== null);
    if (peerValues.length > 0) {
      details.push({
        key: "savePct",
        label: "Räddningsprocent",
        playerValue: playerSavePct,
        peerAverage: Math.round(((peerValues.reduce((a, b) => a + b, 0) / peerValues.length) + Number.EPSILON) * 10) / 10,
        percentile: percentile(playerSavePct, peerValues),
        weight: GOALKEEPER_WEIGHTS.savePct,
        contribution: 0, // fylls i av caller efter ev. viktomskalning
        unit: "%",
      });
    }
  }

  const playerGcPer90 = goalsConcededPer90(player);
  if (playerGcPer90 !== null) {
    const peerValues = peers.map(goalsConcededPer90).filter((v): v is number => v !== null);
    if (peerValues.length > 0) {
      details.push({
        key: "goalsConcededPer90",
        label: "Insläppta mål",
        playerValue: playerGcPer90,
        peerAverage: Math.round(((peerValues.reduce((a, b) => a + b, 0) / peerValues.length) + Number.EPSILON) * 10) / 10,
        percentile: invertedPercentile(playerGcPer90, peerValues),
        weight: GOALKEEPER_WEIGHTS.goalsConcededPer90,
        contribution: 0,
        unit: "/90",
      });
    }
  }

  const playerCsPct = cleanSheetPct(player);
  if (playerCsPct !== null) {
    const peerValues = peers.map(cleanSheetPct).filter((v): v is number => v !== null);
    if (peerValues.length > 0) {
      details.push({
        key: "cleanSheetPct",
        label: "Clean sheet-andel",
        playerValue: playerCsPct,
        peerAverage: Math.round(((peerValues.reduce((a, b) => a + b, 0) / peerValues.length) + Number.EPSILON) * 10) / 10,
        percentile: percentile(playerCsPct, peerValues),
        weight: GOALKEEPER_WEIGHTS.cleanSheetPct,
        contribution: 0,
        unit: "%",
      });
    }
  }

  // Proportionell viktomskalning, exakt samma princip som computeOvr i
  // position-rating-config.ts: om ett mått saknar underlag helt fördelas
  // dess vikt om över de kvarvarande, istället för att tyst räkna det som 0.
  const availableWeightSum = details.reduce((a, d) => a + d.weight, 0);
  for (const d of details) {
    const effectiveWeight = availableWeightSum > 0 ? (d.weight / availableWeightSum) * 100 : 0;
    d.contribution = Math.round(((d.percentile * effectiveWeight) / 100 + Number.EPSILON) * 10) / 10;
  }

  return details;
}

function toPeerShape(agg: PlayerSeasonAggregate): PlayerSeasonAggregate & { minutes_played: number } {
  return { ...agg, minutes_played: agg.minutesPlayed };
}

async function resolveSeasonId(supabase: Supabase, year: number): Promise<number | null> {
  const { data: seasonRow, error } = await supabase.from("season").select("id").eq("year", year).maybeSingle();
  if (error) throw error;
  return seasonRow?.id ?? null;
}

export async function computeGoalkeeperRating(
  supabase: Supabase,
  params: { playerId: number; season: number }
): Promise<GoalkeeperRating> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  if (seasonId === null) return unavailable("Ingen data för den säsongen.");

  const aggregates = await aggregatePlayerSeasonStats(supabase, { seasonId });
  const player = aggregates.get(params.playerId);
  if (!player) return unavailable("Spelaren har ingen registrerad speltid den här säsongen.");

  const positionGroupInfo = getPositionGroup(player.position);
  if (!positionGroupInfo || positionGroupInfo.group !== "goalkeeper") {
    return unavailable("Spelaren är inte målvakt — se computePlayerRating istället.");
  }

  const samePositionOthers = [...aggregates.values()].filter(
    (p) => p.playerId !== params.playerId && getPositionGroup(p.position)?.group === "goalkeeper"
  );
  const { peers, summary } = selectPeers(samePositionOthers.map(toPeerShape), positionGroupInfo.label, player.minutesPlayed);

  const metrics = rateGoalkeeper(player, peers);
  const ovr = metrics.length > 0 ? Math.min(OVR_CAP, Math.round(metrics.reduce((a, d) => a + d.contribution, 0))) : null;

  const ownTier = tierFromThresholds(player.minutesPlayed, 900, 450);
  const peerTier = tierFromThresholds(peers.length, 12, 6);
  const confidence: GoalkeeperConfidence = {
    tier: worseTier(ownTier, peerTier),
    peerLabel: positionGroupInfo.label,
    peerCount: summary.count,
    ownMinutes: player.minutesPlayed,
    ownTier,
    peerTier,
    minMinutesApplied: summary.minMinutesApplied,
  };

  return { available: true, unavailableReason: null, ovr, metrics, confidence };
}

export async function computeSeasonGoalkeeperRatings(
  supabase: Supabase,
  params: { season: number }
): Promise<Map<number, GoalkeeperRating>> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  const result = new Map<number, GoalkeeperRating>();
  if (seasonId === null) return result;

  const aggregates = await aggregatePlayerSeasonStats(supabase, { seasonId });
  const all = [...aggregates.values()].filter((p) => getPositionGroup(p.position)?.group === "goalkeeper");

  for (const player of all) {
    const positionGroupInfo = getPositionGroup(player.position);
    if (!positionGroupInfo) continue;
    const samePositionOthers = all.filter((p) => p.playerId !== player.playerId);
    const { peers, summary } = selectPeers(samePositionOthers.map(toPeerShape), positionGroupInfo.label, player.minutesPlayed);

    const metrics = rateGoalkeeper(player, peers);
    const ovr = metrics.length > 0 ? Math.min(OVR_CAP, Math.round(metrics.reduce((a, d) => a + d.contribution, 0))) : null;

    const ownTier = tierFromThresholds(player.minutesPlayed, 900, 450);
    const peerTier = tierFromThresholds(peers.length, 12, 6);
    result.set(player.playerId, {
      available: true,
      unavailableReason: null,
      ovr,
      metrics,
      confidence: {
        tier: worseTier(ownTier, peerTier),
        peerLabel: positionGroupInfo.label,
        peerCount: summary.count,
        ownMinutes: player.minutesPlayed,
        ownTier,
        peerTier,
        minMinutesApplied: summary.minMinutesApplied,
      },
    });
  }

  return result;
}
