import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 17 (2026-08-22) — riktig trofédata från api-football (/trophies),
 * importerad av scripts/import/import-player-career.ts. Se den filens
 * huvud för research-underlaget. Ingen egen tolkning av `place`/`season` —
 * visas som rå text från API:t (t.ex. "Winner"/"2nd Place",
 * "2019/2020") — översatt vid visning (se PlayerTrophiesSection.tsx),
 * aldrig omtolkad.
 */
export interface PlayerTrophy {
  leagueName: string;
  country: string | null;
  season: string;
  place: string;
}

interface TrophyRow {
  league_name: string;
  country: string | null;
  season: string;
  place: string;
}

export async function getPlayerTrophies(supabase: Supabase, params: { playerId: number }): Promise<PlayerTrophy[]> {
  // Felresistent (samma skäl som career-timeline.ts:s getForeignCareerStints):
  // migrationen kan vara okörd än — en saknad tabell ska ge en tom lista.
  const { data, error } = await supabase
    .from("player_trophy")
    .select("league_name, country, season, place")
    .eq("player_id", params.playerId)
    .returns<TrophyRow[]>();
  if (error) return [];

  return (data ?? [])
    .map((r) => ({ leagueName: r.league_name, country: r.country, season: r.season, place: r.place }))
    .sort((a, b) => b.season.localeCompare(a.season));
}
