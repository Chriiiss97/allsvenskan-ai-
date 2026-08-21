import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Data-sektionens breddning (2026-08-20): delade "katalog"-frågor —
 * säsongslista och lagslista — som ersätter fyra oberoende hårdkodade
 * säsongsarrayer (`[2024,2023,2022]`, i teams/page.tsx, players/page.tsx,
 * matches/page.tsx, players/compare/page.tsx) och två oberoende hårdkodade
 * lagsarrayer (som dessutom stavade AIK olika sinsemellan). Ren
 * databasläsning, samma `ALLSVENSKAN_LEAGUE_EXTERNAL_ID`-princip som
 * scripts/import/config.ts — definierad lokalt här (inte importerad från
 * scripts/) eftersom lib/ aldrig ska bero på scripts/, fel lagerriktning.
 */
const ALLSVENSKAN_LEAGUE_EXTERNAL_ID = 113;

export interface SeasonOption {
  id: number;
  year: number;
}

/** Alla säsonger i databasen, fallande (2026 → 2016 just nu) — inte hårdkodat. */
export async function getAvailableSeasons(supabase: Supabase): Promise<SeasonOption[]> {
  const { data: league } = await supabase
    .from("league")
    .select("id")
    .eq("external_id", ALLSVENSKAN_LEAGUE_EXTERNAL_ID)
    .maybeSingle();
  if (!league) return [];

  const { data, error } = await supabase
    .from("season")
    .select("id, year")
    .eq("league_id", league.id)
    .order("year", { ascending: false })
    .returns<SeasonOption[]>();
  if (error) throw error;
  return data ?? [];
}

export interface TeamOption {
  id: number;
  external_id: number | null;
  name: string;
  logoUrl: string | null;
}

/** Alla lag i databasen (för närvarande 33), alfabetiskt. */
export async function listTeams(supabase: Supabase): Promise<TeamOption[]> {
  const { data, error } = await supabase
    .from("team")
    .select("id, external_id, name, logo_url")
    .order("name")
    .returns<{ id: number; external_id: number | null; name: string; logo_url: string | null }[]>();
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, external_id: t.external_id, name: t.name, logoUrl: t.logo_url }));
}

export interface TeamOverviewRow extends TeamOption {
  /** null om ingen säsong valts — visa aldrig en påhittad placering. */
  rank: number | null;
  points: number | null;
  played: number | null;
}

interface StandingsRow {
  team_id: number;
  rank: number;
  points: number;
  played: number | null;
  captured_at: string;
}

/**
 * Lagöversikten (steg 1): alla lag, plus tabellplacering/poäng/matcher OM en
 * säsong valts. `standings` är append-only (ny rad varje hämtning, se
 * migrationens kommentar) — dedupar därför till senaste `captured_at` per
 * lag i JS, aldrig ett rått `.eq()` som råkar träffa fel ögonblicksbild.
 */
export async function listTeamsWithSeasonSummary(
  supabase: Supabase,
  params: { season?: number }
): Promise<TeamOverviewRow[]> {
  const teams = await listTeams(supabase);
  if (!params.season) {
    return teams.map((t) => ({ ...t, rank: null, points: null, played: null }));
  }

  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).maybeSingle();
  if (!seasonRow) return teams.map((t) => ({ ...t, rank: null, points: null, played: null }));

  const { data: standingsRows, error } = await supabase
    .from("standings")
    .select("team_id, rank, points, played, captured_at")
    .eq("season_id", seasonRow.id)
    .order("captured_at", { ascending: false })
    .returns<StandingsRow[]>();
  if (error) throw error;

  const latestByTeam = new Map<number, StandingsRow>();
  for (const row of standingsRows ?? []) {
    if (!latestByTeam.has(row.team_id)) latestByTeam.set(row.team_id, row);
  }

  return teams
    .map((t) => {
      const s = latestByTeam.get(t.id);
      return { ...t, rank: s?.rank ?? null, points: s?.points ?? null, played: s?.played ?? null };
    })
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.name.localeCompare(b.name, "sv");
    });
}
