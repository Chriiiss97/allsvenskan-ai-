import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Fas 15 (Complete Scout Player Card) — Allsvensk karriärtidslinje
 * ============================================================================
 * Grupperar spelarens redan hämtade `statistics`-rader (samma rader
 * getPlayerProfile redan läser) till en tidslinje, nyaste säsong först.
 *
 * VIKTIGT (se undersökningen tidigare i den här konversationen — "hur
 * hanterar vi spelare som spelat utomlands?"): det här är UTESLUTANDE
 * Allsvensk historik. Verifierat mot databasen: `league`-tabellen har bara
 * 1 rad (Allsvenskan), `api_raw_response` (tänkt RAW-arkiv) har 0 rader —
 * ingen utländsk klubbhistorik finns lagrad någonstans i systemet. UI:t
 * (CareerTimeline.tsx) måste alltid visa en explicit disclaimer om detta —
 * ALDRIG låtsas ha eller gissa på utländska säsonger/klubbar.
 *
 * Samma `hasPlayedSeason`-filter som resten av produkten (appearances > 0)
 * — en spelare som var registrerad men aldrig spelade en match för klubben
 * en säsong ska inte synas som en "karriärpost".
 */

export interface CareerTimelineEntry {
  seasonYear: number;
  teamId: number;
  teamName: string;
  teamLogoUrl: string | null;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
}

interface StatisticsRow {
  appearances: number;
  minutes_played: number;
  goals: number;
  assists: number;
  team: { id: number; name: string; logo_url: string | null } | null;
  season: { year: number } | null;
}

export async function getCareerTimeline(supabase: Supabase, params: { playerId: number }): Promise<CareerTimelineEntry[]> {
  const { data, error } = await supabase
    .from("statistics")
    .select("appearances, minutes_played, goals, assists, team:team_id(id, name, logo_url), season:season_id(year)")
    .eq("player_id", params.playerId)
    .returns<StatisticsRow[]>();
  if (error) throw error;

  return (data ?? [])
    .filter((r) => hasPlayedSeason(r.appearances) && r.team !== null && r.season !== null)
    .map((r) => ({
      seasonYear: r.season!.year,
      teamId: r.team!.id,
      teamName: r.team!.name,
      teamLogoUrl: r.team!.logo_url,
      appearances: r.appearances,
      minutesPlayed: r.minutes_played,
      goals: r.goals,
      assists: r.assists,
    }))
    .sort((a, b) => b.seasonYear - a.seasonYear || a.teamName.localeCompare(b.teamName));
}
