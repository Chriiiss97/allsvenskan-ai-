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

export interface StandingsTableRow {
  team: TeamOption;
  rank: number;
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  /** Senaste 5, äldst→nyast, t.ex. "WWDLW" — samma format som api-football, oförändrat. */
  form: string | null;
}

interface FullStandingsRow {
  team_id: number;
  rank: number;
  points: number;
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goals_for: number | null;
  goals_against: number | null;
  goals_diff: number | null;
  form: string | null;
  captured_at: string;
}

/**
 * Fas 14.3 — den fulla serietabellen (rank/M/V/O/F/GM/IM/+-/poäng/form),
 * inte bara lagöversiktens rank/points/played-brottstycke. Samma
 * dedupe-till-senaste-`captured_at`-princip som listTeamsWithSeasonSummary
 * (standings är append-only, se migrationens kommentar), bara med fler
 * fält. Lag utan tabelldata för säsongen (t.ex. gästspel Sportmonks-bara
 * lag inte spelat i Allsvenskan den säsongen) utelämnas helt — ingen
 * påhittad "0:a" rad.
 */
export async function getStandingsTable(supabase: Supabase, params: { season: number }): Promise<StandingsTableRow[]> {
  const teams = await listTeams(supabase);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).maybeSingle();
  if (!seasonRow) return [];

  const { data: rows, error } = await supabase
    .from("standings")
    .select("team_id, rank, points, played, win, draw, lose, goals_for, goals_against, goals_diff, form, captured_at")
    .eq("season_id", seasonRow.id)
    .order("captured_at", { ascending: false })
    .returns<FullStandingsRow[]>();
  if (error) throw error;

  const latestByTeam = new Map<number, FullStandingsRow>();
  for (const row of rows ?? []) {
    if (!latestByTeam.has(row.team_id)) latestByTeam.set(row.team_id, row);
  }

  const result: StandingsTableRow[] = [];
  for (const row of latestByTeam.values()) {
    const team = teamById.get(row.team_id);
    if (!team) continue;
    result.push({
      team,
      rank: row.rank,
      points: row.points,
      played: row.played ?? 0,
      win: row.win ?? 0,
      draw: row.draw ?? 0,
      lose: row.lose ?? 0,
      goalsFor: row.goals_for ?? 0,
      goalsAgainst: row.goals_against ?? 0,
      goalsDiff: row.goals_diff ?? 0,
      form: row.form,
    });
  }

  return result.sort((a, b) => a.rank - b.rank);
}
