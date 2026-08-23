/**
 * OVR v2 — topplistor och utvecklingsjämförelser.
 * =============================================================================
 * Ersätter lib/football/scout/leaderboard.ts. Skillnaden i kostnad är stor:
 * den gamla gjorde tre paginerade genomläsningar av hela säsongens
 * fixture_player_stats (~9 500 rader) vid varje sidladdning för att räkna fram
 * betyg som redan fanns beräknade. Den här gör EN indexerad fråga mot
 * player_ratings med spelaridentiteten inbäddad.
 *
 * Alla listor filtrerar som standard på DEFAULT_LIST_MIN_MINUTES. Se store.ts
 * för varför — kort version: motorn ger en spelare med 20 minuters speltid och
 * stark historik ett korrekt högt betyg, men en topplista påstår sig visa något
 * annat än det. Filtret går att stänga av med includeLowSample.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { calculateAge } from "../football/age";
import { DEFAULT_LIST_MIN_MINUTES, displayHint, type OvrDisplayHint } from "./store";
import type { ConfidenceTier, PositionGroup } from "./config";

type Supabase = SupabaseClient<Database>;

export interface OvrLeaderboardEntry {
  playerId: number;
  fullName: string;
  photoUrl: string | null;
  teamId: number | null;
  age: number | null;
  positionGroup: PositionGroup;
  secondaryPositionGroup: PositionGroup | null;

  ovr: number;
  potential: number | null;
  form: number;
  confidenceTier: ConfidenceTier | null;
  priorWeight: number;
  minutesPlayed: number;
  externalMinutes: number;
  unratedMinutes: number;
  /** Under DEFAULT_LIST_MIN_MINUTES — visas bara när includeLowSample är på. */
  belowMinutesFloor: boolean;
  /** Färdig presentationskontext, så ingen lista kan råka visa ett naket tal. */
  display: OvrDisplayHint;
}

export interface OvrLeaderboardParams {
  season: number;
  positionGroup?: PositionGroup;
  teamId?: number;
  ageMin?: number;
  ageMax?: number;
  /**
   * Ta med spelare under minutgränsen. Av som standard: utan filtret toppas
   * listan av spelare vars betyg nästan helt är historik, vilket är korrekt
   * som betyg men missvisande som "ligans bästa den här säsongen".
   */
  includeLowSample?: boolean;
  minMinutes?: number;
}

type RatingRow = {
  player_id: number;
  club_id: number | null;
  position_group: PositionGroup;
  secondary_position_group: PositionGroup | null;
  position_confidence: number;
  ovr: number | null;
  potential: number | null;
  form: number;
  confidence: number;
  confidence_tier: ConfidenceTier | null;
  prior_weight: number;
  minutes_played: number;
  external_minutes: number;
  unrated_minutes: number;
  season_id: number;
  season_year: number;
  player: { full_name: string; photo_url: string | null; birth_date: string | null } | null;
};

const LEADERBOARD_SELECT =
  "player_id, club_id, position_group, secondary_position_group, position_confidence, ovr, potential, form, " +
  "confidence, confidence_tier, prior_weight, minutes_played, external_minutes, unrated_minutes, season_id, season_year, " +
  "player:player_id(full_name, photo_url, birth_date)";

async function resolveSeasonId(supabase: Supabase, year: number): Promise<number | null> {
  const { data, error } = await supabase.from("season").select("id").eq("year", year).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function toEntry(row: RatingRow): OvrLeaderboardEntry | null {
  if (row.ovr === null || !row.player) return null;
  const minutesFloor = DEFAULT_LIST_MIN_MINUTES;
  const rating = {
    playerId: row.player_id,
    seasonId: row.season_id,
    seasonYear: row.season_year,
    clubId: row.club_id,
    positionGroup: row.position_group,
    secondaryPositionGroup: row.secondary_position_group,
    positionConfidence: Number(row.position_confidence ?? 0),
    ovr: Number(row.ovr),
    currentSeasonRating: null,
    historicalRating: null,
    potential: row.potential === null ? null : Number(row.potential),
    form: Number(row.form ?? 0),
    confidence: Number(row.confidence ?? 0),
    confidenceTier: row.confidence_tier,
    priorWeight: Number(row.prior_weight ?? 0),
    minutesPlayed: row.minutes_played ?? 0,
    externalMinutes: row.external_minutes ?? 0,
    unratedMinutes: row.unrated_minutes ?? 0,
    subscores: {
      finishing: null,
      passing: null,
      dribbling: null,
      defending: null,
      duels: null,
      goalkeeping: null,
    },
    configVersion: "",
  };

  return {
    playerId: row.player_id,
    fullName: row.player.full_name,
    photoUrl: row.player.photo_url,
    teamId: row.club_id,
    age: calculateAge(row.player.birth_date),
    positionGroup: row.position_group,
    secondaryPositionGroup: row.secondary_position_group,
    ovr: Number(row.ovr),
    potential: row.potential === null ? null : Number(row.potential),
    form: Number(row.form ?? 0),
    confidenceTier: row.confidence_tier,
    priorWeight: Number(row.prior_weight ?? 0),
    minutesPlayed: row.minutes_played ?? 0,
    externalMinutes: row.external_minutes ?? 0,
    unratedMinutes: row.unrated_minutes ?? 0,
    belowMinutesFloor: (row.minutes_played ?? 0) < minutesFloor,
    display: displayHint(rating),
  };
}

/** Rankad topplista för en säsong, sorterad fallande på OVR. */
export async function getOvrLeaderboard(
  supabase: Supabase,
  params: OvrLeaderboardParams
): Promise<OvrLeaderboardEntry[]> {
  const seasonId = await resolveSeasonId(supabase, params.season);
  if (seasonId === null) return [];

  const minMinutes = params.minMinutes ?? DEFAULT_LIST_MIN_MINUTES;

  let query = supabase
    .from("player_ratings")
    .select(LEADERBOARD_SELECT)
    .eq("season_id", seasonId)
    .not("ovr", "is", null)
    .order("ovr", { ascending: false });

  // Filtrera i databasen där det går — indexet player_ratings_leaderboard_idx
  // täcker (season_id, ovr desc) och listan blir sällan större än ~500 rader.
  if (!params.includeLowSample) query = query.gte("minutes_played", minMinutes);
  if (params.positionGroup) query = query.eq("position_group", params.positionGroup);
  if (params.teamId) query = query.eq("club_id", params.teamId);

  const { data, error } = await query.returns<RatingRow[]>();
  if (error) throw error;

  let entries = (data ?? []).map(toEntry).filter((e): e is OvrLeaderboardEntry => e !== null);

  // Ålder går inte att filtrera i databasen — den är härledd ur birth_date.
  if (params.ageMin !== undefined) entries = entries.filter((e) => e.age !== null && e.age >= params.ageMin!);
  if (params.ageMax !== undefined) entries = entries.filter((e) => e.age !== null && e.age <= params.ageMax!);

  return entries;
}

export interface OvrTrendLeaderboardEntry extends Omit<OvrLeaderboardEntry, "ovr"> {
  /** Tidigare säsongens OVR. */
  ovrA: number;
  /** Senare säsongens OVR — även `ovr` för kompatibilitet med listrendering. */
  ovrB: number;
  ovr: number;
  delta: number;
}

export interface OvrTrendLeaderboardParams {
  seasonYearA: number;
  seasonYearB: number;
  positionGroup?: PositionGroup;
  teamId?: number;
  ageMin?: number;
  ageMax?: number;
  includeLowSample?: boolean;
}

/**
 * "Mest förbättrad/försämrad" mellan två säsonger, sorterad fallande på delta.
 *
 * Bara spelare med giltigt OVR i BÅDA säsongerna och SAMMA positionsgrupp. En
 * spelare som gått från ytterback till mittfältare bedöms mot en annan
 * vikttabell, och deltat vore inte ett uttalande om utveckling.
 *
 * Identiteten hämtas från MÅL-säsongen — vem spelaren är nu, inte då.
 */
export async function getOvrTrendLeaderboard(
  supabase: Supabase,
  params: OvrTrendLeaderboardParams
): Promise<OvrTrendLeaderboardEntry[]> {
  const [a, b] = await Promise.all([
    getOvrLeaderboard(supabase, { season: params.seasonYearA, includeLowSample: params.includeLowSample }),
    getOvrLeaderboard(supabase, {
      season: params.seasonYearB,
      includeLowSample: params.includeLowSample,
      positionGroup: params.positionGroup,
      teamId: params.teamId,
      ageMin: params.ageMin,
      ageMax: params.ageMax,
    }),
  ]);

  const byPlayerA = new Map(a.map((e) => [e.playerId, e]));
  const entries: OvrTrendLeaderboardEntry[] = [];
  for (const later of b) {
    const earlier = byPlayerA.get(later.playerId);
    if (!earlier) continue;
    if (earlier.positionGroup !== later.positionGroup) continue;
    entries.push({
      ...later,
      ovrA: earlier.ovr,
      ovrB: later.ovr,
      delta: Math.round((later.ovr - earlier.ovr) * 10) / 10,
    });
  }

  entries.sort((x, y) => y.delta - x.delta);
  return entries;
}
