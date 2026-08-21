import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { calculateAge } from "./age";

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
  /**
   * Namnsök — filtreras i JS på den redan säsongsavgränsade mängden (se
   * filbeskrivningen), INTE en DB-fråga. player.full_name saknar index
   * (bekräftat, ingen trigram/GIN), men ~200–400 rader/säsong gör en
   * sekventiell JS-substrängsökning trivialt billig — riktig sökning över
   * HELA säsongen, inte bara sidan som visas (till skillnad från den
   * tidigare klient-lokala sökningen som bara såg redan hämtade rader).
   */
  query?: string;
  sort: "name" | "goals" | "assists" | "appearances" | "minutes" | "goalsPer90" | "age";
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
}

export interface PlayerListResult {
  items: PlayerListItem[];
  total: number;
}

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
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

  const { data, error } = await query.returns<StatRow[]>();
  if (error) throw error;

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
    }));

  if (params.position) items = items.filter((p) => p.position === params.position);
  if (params.ageMin !== undefined) items = items.filter((p) => p.age !== null && p.age >= params.ageMin!);
  if (params.ageMax !== undefined) items = items.filter((p) => p.age !== null && p.age <= params.ageMax!);
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
