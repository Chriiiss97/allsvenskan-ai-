import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, MIN_PEER_MINUTES, type PositionGroupKey } from "../position-group";
import { calculateAge } from "../age";
import { aggregatePlayerSeasonStats } from "./rating-aggregates";
import { computeSeasonOvrMap } from "./compute-rating";
import { getRatingTrendComparison } from "./rating-store";

type Supabase = SupabaseClient<Database>;

/**
 * Player Rating — Topplista (planens steg 7). Egen liten sammanslagning
 * istället för att återanvända computePlayerRating/computeGoalkeeperRating
 * rakt av: topplistan behöver bara identitet (namn/lag/ålder/foto) + OVR +
 * egna minuter, inte hela "varför X?"-nedbrytningen varje enskild profil
 * bär på. Två oberoende datakällor slås ihop i JS: aggregatePlayerSeasonStats
 * (identitet+minuter, EN gång) och computeSeasonOvrMap (OVR, som redan
 * internt kör utespelar-/målvaktsmodellerna parallellt).
 *
 * Ja, det innebär tre paginerade fixture_player_stats-läsningar av samma
 * säsong per sidladdning (samma medvetna, dokumenterade kostnad som
 * computeSeasonOvrMap redan bär) — hålls billigt av sidnivåns
 * `revalidate = 3600`, inte optimerat bort i förtid.
 */

export interface RatingLeaderboardEntry {
  playerId: number;
  fullName: string;
  photoUrl: string | null;
  position: string | null;
  positionGroup: PositionGroupKey | null;
  teamId: number;
  age: number | null;
  ovr: number;
  ownMinutes: number;
  /** Under MIN_PEER_MINUTES (450) — samma tröskel som resten av Player Rating/DNA. */
  belowMinutesFloor: boolean;
}

export interface RatingLeaderboardParams {
  season: number;
  positionGroup?: PositionGroupKey;
  teamId?: number;
  ageMin?: number;
  ageMax?: number;
  /**
   * Default-vyn (utelämnad/false) filtrerar bort spelare under
   * MIN_PEER_MINUTES för en ren rankad lista — annars dominerar
   * enstaka-match-målvakter (0 insläppta på 30 minuter → percentil 99,
   * samma kända litet-underlag-fenomen som redan bekräftat i steg 4/6:s
   * verifiering). `includeLowSample: true` visar allt, inklusive dem.
   */
  includeLowSample?: boolean;
}

async function resolveSeasonId(supabase: Supabase, year: number): Promise<number | null> {
  const { data: seasonRow, error } = await supabase.from("season").select("id").eq("year", year).maybeSingle();
  if (error) throw error;
  return seasonRow?.id ?? null;
}

export async function getRatingLeaderboard(supabase: Supabase, params: RatingLeaderboardParams): Promise<RatingLeaderboardEntry[]> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  if (seasonId === null) return [];

  const [aggregates, ovrMap] = await Promise.all([
    aggregatePlayerSeasonStats(supabase, { seasonId }),
    computeSeasonOvrMap(supabase, { season: params.season }),
  ]);

  let entries: RatingLeaderboardEntry[] = [];
  for (const agg of aggregates.values()) {
    const ovr = ovrMap.get(agg.playerId);
    if (ovr === undefined || ovr === null) continue; // otillräckligt underlag — hör inte hemma i en rankad lista
    const positionGroupInfo = getPositionGroup(agg.position);
    entries.push({
      playerId: agg.playerId,
      fullName: agg.fullName,
      photoUrl: agg.photoUrl,
      position: agg.position,
      positionGroup: positionGroupInfo?.group ?? null,
      teamId: agg.teamId,
      age: calculateAge(agg.birthDate),
      ovr,
      ownMinutes: agg.minutesPlayed,
      belowMinutesFloor: agg.minutesPlayed < MIN_PEER_MINUTES,
    });
  }

  if (params.positionGroup) entries = entries.filter((e) => e.positionGroup === params.positionGroup);
  if (params.teamId) entries = entries.filter((e) => e.teamId === params.teamId);
  if (params.ageMin !== undefined) entries = entries.filter((e) => e.age !== null && e.age >= params.ageMin!);
  if (params.ageMax !== undefined) entries = entries.filter((e) => e.age !== null && e.age <= params.ageMax!);
  if (!params.includeLowSample) entries = entries.filter((e) => !e.belowMinutesFloor);

  entries.sort((a, b) => b.ovr - a.ovr);
  return entries;
}

export interface RatingTrendLeaderboardEntry {
  playerId: number;
  fullName: string;
  photoUrl: string | null;
  position: string | null;
  positionGroup: PositionGroupKey;
  teamId: number;
  age: number | null;
  /** Tidigare säsongens OVR. */
  ovrA: number;
  /** Senare (target-)säsongens OVR. */
  ovrB: number;
  delta: number;
  belowMinutesFloor: boolean;
}

export interface RatingTrendLeaderboardParams {
  /** Tidigare säsong (jämförelsepunkt). */
  seasonYearA: number;
  /** Senare säsong (target — identitet/lag/ålder hämtas från den här säsongen). */
  seasonYearB: number;
  positionGroup?: PositionGroupKey;
  teamId?: number;
  ageMin?: number;
  ageMax?: number;
  includeLowSample?: boolean;
}

/**
 * "Mest förbättrad/försämrad" — säsong-mot-säsong-delta över hela ligan.
 * Byggd på EXAKT samma persisterade facit (rating-store.ts) som
 * getRatingLeaderboard och profilsidans utvecklingssektion — inget nytt
 * beräkningssystem. Returnerar `null` om NÅGON av de två säsongerna saknar
 * facit i player_season_rating (backfill inte klar än) — anroparen visar då
 * en ärlig "inte tillgängligt" istället för en tom eller felaktig lista.
 *
 * Sorterad fallande på delta (mest förbättrad först) — anroparen vänder
 * listan för "mest försämrad".
 */
export async function getRatingTrendLeaderboard(
  supabase: Supabase,
  params: RatingTrendLeaderboardParams
): Promise<RatingTrendLeaderboardEntry[] | null> {
  const [seasonIdA, seasonIdB] = await Promise.all([
    resolveSeasonId(supabase, params.seasonYearA),
    resolveSeasonId(supabase, params.seasonYearB),
  ]);
  if (seasonIdA === null || seasonIdB === null) return null;

  const [trendRows, aggregatesB] = await Promise.all([
    getRatingTrendComparison(supabase, { seasonIdA, seasonIdB }),
    aggregatePlayerSeasonStats(supabase, { seasonId: seasonIdB }),
  ]);
  if (trendRows === null) return null;

  let entries: RatingTrendLeaderboardEntry[] = [];
  for (const t of trendRows) {
    // Identitet (namn/lag/ålder/position) hämtas från MÅL-säsongen — vem
    // spelaren ÄR just nu, inte vem de var i jämförelsesäsongen.
    const agg = aggregatesB.get(t.playerId);
    if (!agg) continue;
    entries.push({
      playerId: t.playerId,
      fullName: agg.fullName,
      photoUrl: agg.photoUrl,
      position: agg.position,
      positionGroup: t.positionGroup,
      teamId: agg.teamId,
      age: calculateAge(agg.birthDate),
      ovrA: t.ovrA,
      ovrB: t.ovrB,
      delta: t.delta,
      belowMinutesFloor: agg.minutesPlayed < MIN_PEER_MINUTES,
    });
  }

  if (params.positionGroup) entries = entries.filter((e) => e.positionGroup === params.positionGroup);
  if (params.teamId) entries = entries.filter((e) => e.teamId === params.teamId);
  if (params.ageMin !== undefined) entries = entries.filter((e) => e.age !== null && e.age >= params.ageMin!);
  if (params.ageMax !== undefined) entries = entries.filter((e) => e.age !== null && e.age <= params.ageMax!);
  if (!params.includeLowSample) entries = entries.filter((e) => !e.belowMinutesFloor);

  entries.sort((a, b) => b.delta - a.delta);
  return entries;
}
