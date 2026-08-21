import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { calculateAge } from "./age";
import { computeSeasonOvrMap } from "./rating/compute-rating";
import { getRatingTrendComparison, getStoredSeasonRatings, type RatingTrendEntry } from "./rating/rating-store";
import { computePlayerArchetypes, type MatchedArchetype } from "./rating/archetypes";

type Supabase = SupabaseClient<Database>;

/**
 * Data-sektionens breddning (2026-08-20) — spelarsökning/lista, den mest
 * riskabla nya biten (se plan). Säsongsscopat med avsikt: en hel säsongs
 * statistics-rader för hela ligan (~200–400) är bekräftat under Supabases
 * 1000-radstak, till skillnad från hela `statistics`-tabellen (6 377 rader
 * totalt, "alla säsonger"-läge skjutet till en separat, senare omgång —
 * se planen). Ålder/mål-per-90/position filtreras/sorteras i JS på den
 * redan avgränsade mängden, INTE en obegränsad fråga — samma disciplin som
 * redan etablerad i team-rollup.ts/finalize-match.ts för större tabeller.
 */

interface StatRow {
  player_id: number;
  team_id: number;
  goals: number;
  assists: number;
  appearances: number;
  minutes_played: number;
  player: {
    id: number;
    full_name: string;
    position: string | null;
    photo_url: string | null;
    birth_date: string | null;
    current_team_id: number | null;
  } | null;
}

export interface PlayerListParams {
  season: number;
  teamId?: number;
  position?: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker";
  ageMin?: number;
  ageMax?: number;
  goalsMin?: number;
  assistsMin?: number;
  minutesMin?: number;
  /** Player Rating OVR (0–99) — filtreras i JS, se computeSeasonOvrMap. Spelare utan rating (t.ex. otillräckligt underlag) exkluderas av ett satt min/max, precis som Player Rating-kortet självt skulle visa "Ej tillgängligt" för dem. */
  ratingMin?: number;
  ratingMax?: number;
  /**
   * Scout (2026-08-21): säsong att jämföra OVR mot, för att filtrera/sortera
   * på UTVECKLING (samma persisterade facit som Topplistans trend-läge, se
   * rating-store.ts:s getRatingTrendComparison — inget nytt system). Om
   * satt beräknas `ovrDelta` per spelare; annars är fältet alltid null och
   * ovrDeltaMin/Max ignoreras helt (ingen kostnad om ingen frågar efter det).
   */
  compareSeason?: number;
  ovrDeltaMin?: number;
  ovrDeltaMax?: number;
  /**
   * Scout Engine Fas 4 (2026-08-21) — arketyp-filter (se rating/archetypes.ts).
   * Matchar en spelare som har MINST EN av de angivna arketyperna (OR, inte
   * AND — samma "hitta kandidater", inte "kräv allt samtidigt"-princip som
   * resten av Scout:s filter). Läser samma persisterade lager som Fas 2/3,
   * ingen ny beräkning.
   */
  archetypeKeys?: string[];
  /**
   * Namnsök — filtreras i JS på den redan säsongsavgränsade mängden (se
   * filbeskrivningen), INTE en DB-fråga. player.full_name saknar index
   * (bekräftat, ingen trigram/GIN), men ~200–400 rader/säsong gör en
   * sekventiell JS-substrängsökning trivialt billig — riktig sökning över
   * HELA säsongen, inte bara sidan som visas (till skillnad från den
   * tidigare klient-lokala sökningen som bara såg redan hämtade rader).
   */
  query?: string;
  sort: "name" | "goals" | "assists" | "appearances" | "minutes" | "goalsPer90" | "age" | "rating" | "ovrDelta";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface PlayerListItem {
  id: number;
  fullName: string;
  position: string | null;
  photoUrl: string | null;
  teamId: number;
  age: number | null;
  goals: number;
  assists: number;
  appearances: number;
  minutesPlayed: number;
  goalsPer90: number | null;
  /** Player Rating OVR (0–99) — null om otillräckligt underlag den här säsongen, se lib/football/rating/compute-rating.ts. */
  rating: number | null;
  /** rating minus OVR i params.compareSeason — null om compareSeason inte angavs ELLER spelaren saknar giltig OVR i någon av de två säsongerna. */
  ovrDelta: number | null;
  /** Scout Engine Fas 3/4 — regelbaserade spelartyper, alltid en (ev. tom) array. */
  archetypes: MatchedArchetype[];
}

export interface PlayerListResult {
  items: PlayerListItem[];
  total: number;
}

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

/** Hämtar OVR-deltat mot compareSeason — bara om anroparen faktiskt bad om det (compareSeason satt). */
async function resolveTrendComparison(
  supabase: Supabase,
  params: Pick<PlayerListParams, "season" | "compareSeason">
): Promise<RatingTrendEntry[] | null> {
  if (!params.compareSeason) return null;
  const [{ data: seasonA }, { data: seasonB }] = await Promise.all([
    supabase.from("season").select("id").eq("year", params.compareSeason).maybeSingle(),
    supabase.from("season").select("id").eq("year", params.season).maybeSingle(),
  ]);
  if (!seasonA || !seasonB) return null;
  return getRatingTrendComparison(supabase, { seasonIdA: seasonA.id, seasonIdB: seasonB.id });
}

export async function listPlayers(supabase: Supabase, params: PlayerListParams): Promise<PlayerListResult> {
  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).maybeSingle();
  if (!seasonRow) return { items: [], total: 0 };

  let query = supabase
    .from("statistics")
    .select(
      "player_id, team_id, goals, assists, appearances, minutes_played, player:player_id(id, full_name, position, photo_url, birth_date, current_team_id)"
    )
    .eq("season_id", seasonRow.id);
  if (params.teamId) query = query.eq("team_id", params.teamId);
  if (params.goalsMin !== undefined) query = query.gt("goals", params.goalsMin - 1);

  // Parallellt med statistics-frågan ovan — oberoende datakällor
  // (fixture_player_stats via computeSeasonOvrMap/getRatingTrendComparison),
  // ingen anledning att vänta på den ena innan den andra startar.
  const [{ data, error }, ovrMap, trendEntries, storedRatings] = await Promise.all([
    query.returns<StatRow[]>(),
    computeSeasonOvrMap(supabase, { season: params.season }),
    resolveTrendComparison(supabase, params),
    getStoredSeasonRatings(supabase, seasonRow.id),
  ]);
  if (error) throw error;
  const deltaByPlayer = new Map(trendEntries?.map((e) => [e.playerId, e.delta]) ?? []);
  const archetypesByPlayer = new Map<number, MatchedArchetype[]>(
    (storedRatings ?? []).map((r) => [
      r.playerId,
      computePlayerArchetypes({ positionGroup: r.positionGroup, categoryScores: r.categoryScores, metricValues: r.metricValues }, r.confidenceTier),
    ])
  );

  // En spelare kan ha flera rader samma säsong (t.ex. olika league_id för
  // cup/liga) — summera per spelare, samma reduceringslogik som redan
  // fanns i players/page.tsx (nu parametriserad hit).
  const byPlayer = new Map<
    number,
    { player: StatRow["player"]; teamId: number; goals: number; assists: number; appearances: number; minutesPlayed: number }
  >();
  for (const row of data ?? []) {
    if (!row.player) continue;
    const existing = byPlayer.get(row.player_id);
    if (existing) {
      existing.goals += row.goals;
      existing.assists += row.assists;
      existing.appearances += row.appearances;
      existing.minutesPlayed += row.minutes_played;
    } else {
      byPlayer.set(row.player_id, {
        player: row.player,
        teamId: row.team_id,
        goals: row.goals,
        assists: row.assists,
        appearances: row.appearances,
        minutesPlayed: row.minutes_played,
      });
    }
  }

  let items: PlayerListItem[] = [...byPlayer.values()]
    .filter((r) => hasPlayedSeason(r.appearances))
    .map((r) => ({
      id: r.player!.id,
      fullName: r.player!.full_name,
      position: r.player!.position,
      photoUrl: r.player!.photo_url,
      teamId: r.teamId,
      age: calculateAge(r.player!.birth_date),
      goals: r.goals,
      assists: r.assists,
      appearances: r.appearances,
      minutesPlayed: r.minutesPlayed,
      goalsPer90: per90(r.goals, r.minutesPlayed),
      rating: ovrMap.get(r.player!.id) ?? null,
      ovrDelta: deltaByPlayer.get(r.player!.id) ?? null,
      archetypes: archetypesByPlayer.get(r.player!.id) ?? [],
    }));

  if (params.position) items = items.filter((p) => p.position === params.position);
  if (params.ageMin !== undefined) items = items.filter((p) => p.age !== null && p.age >= params.ageMin!);
  if (params.ageMax !== undefined) items = items.filter((p) => p.age !== null && p.age <= params.ageMax!);
  if (params.assistsMin !== undefined) items = items.filter((p) => p.assists >= params.assistsMin!);
  if (params.minutesMin !== undefined) items = items.filter((p) => p.minutesPlayed >= params.minutesMin!);
  if (params.ratingMin !== undefined) items = items.filter((p) => p.rating !== null && p.rating >= params.ratingMin!);
  if (params.ratingMax !== undefined) items = items.filter((p) => p.rating !== null && p.rating <= params.ratingMax!);
  if (params.ovrDeltaMin !== undefined) items = items.filter((p) => p.ovrDelta !== null && p.ovrDelta >= params.ovrDeltaMin!);
  if (params.ovrDeltaMax !== undefined) items = items.filter((p) => p.ovrDelta !== null && p.ovrDelta <= params.ovrDeltaMax!);
  if (params.archetypeKeys && params.archetypeKeys.length > 0) {
    const wanted = new Set(params.archetypeKeys);
    items = items.filter((p) => p.archetypes.some((a) => wanted.has(a.key)));
  }
  if (params.query) {
    const needle = params.query.trim().toLowerCase();
    if (needle) items = items.filter((p) => p.fullName.toLowerCase().includes(needle));
  }

  const dir = params.sortDir === "asc" ? 1 : -1;
  items.sort((a, b) => {
    switch (params.sort) {
      case "name":
        return dir * a.fullName.localeCompare(b.fullName, "sv");
      case "assists":
        return dir * (a.assists - b.assists);
      case "appearances":
        return dir * (a.appearances - b.appearances);
      case "minutes":
        return dir * (a.minutesPlayed - b.minutesPlayed);
      case "age":
        return dir * ((a.age ?? -1) - (b.age ?? -1));
      case "goalsPer90":
        return dir * ((a.goalsPer90 ?? -1) - (b.goalsPer90 ?? -1));
      case "rating":
        return dir * ((a.rating ?? -1) - (b.rating ?? -1));
      case "ovrDelta":
        return dir * ((a.ovrDelta ?? -100) - (b.ovrDelta ?? -100));
      case "goals":
      default:
        return dir * (a.goals - b.goals);
    }
  });

  const total = items.length;
  const start = params.page * params.pageSize;
  const pageItems = items.slice(start, start + params.pageSize);

  return { items: pageItems, total };
}
