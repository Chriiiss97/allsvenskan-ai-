import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveTeam } from "./resolve-team";

type Supabase = SupabaseClient<Database>;

/**
 * Delad affärslogik för tool-lagret (steg 5). Används av två anropare:
 *   1. De egna API-routorna under app/api/** (för manuell testning/felsökning)
 *   2. Chat-endpointen (app/api/chat/route.ts, steg 6) — anropar dessa
 *      funktioner direkt (ingen HTTP-roundtrip) när Claude väljer ett verktyg.
 *
 * FootballDataError = "kända", förväntade fel (okänt lag/säsong) som ska bli
 * ett 404 i API-routorna och ett tydligt tool-fel (inte en krasch) i chatten.
 */
export class FootballDataError extends Error {}

interface StatRow {
  goals: number;
  assists: number;
  appearances: number;
  yellow_cards: number;
  red_cards: number;
  player: { id: number; full_name: string } | null;
  season: { year: number } | null;
}

async function fetchTeamStatistics(supabase: Supabase, teamId: number): Promise<StatRow[]> {
  const { data, error } = await supabase
    .from("statistics")
    .select(
      "goals, assists, appearances, yellow_cards, red_cards, player:player_id(id, full_name), season:season_id(year)"
    )
    .eq("team_id", teamId)
    .returns<StatRow[]>();
  if (error) throw new FootballDataError(error.message);
  return data ?? [];
}

async function assertSeasonExists(supabase: Supabase, year: number) {
  const { data } = await supabase.from("season").select("id").eq("year", year).maybeSingle();
  if (!data) throw new FootballDataError(`Ingen data för säsong ${year}`);
}

async function resolveTeamOrThrow(supabase: Supabase, identifier: string) {
  const team = await resolveTeam(supabase, identifier);
  if (!team) throw new FootballDataError(`Okänt lag: "${identifier}"`);
  return team;
}

// ---------------------------------------------------------------------------
// get_top_scorers
// ---------------------------------------------------------------------------
export interface TopScorersParams {
  team: string;
  season?: number;
  allSeasons?: boolean;
  limit?: number;
}

export async function getTopScorers(supabase: Supabase, params: TopScorersParams) {
  const team = await resolveTeamOrThrow(supabase, params.team);
  if (params.season && !params.allSeasons) await assertSeasonExists(supabase, params.season);

  const rows = await fetchTeamStatistics(supabase, team.id);
  const limit = Math.min(params.limit ?? 10, 50);

  if (params.allSeasons) {
    const totals = new Map<
      number,
      { name: string; goals: number; assists: number; appearances: number }
    >();
    for (const r of rows) {
      if (!r.player) continue;
      const entry = totals.get(r.player.id) ?? {
        name: r.player.full_name,
        goals: 0,
        assists: 0,
        appearances: 0,
      };
      entry.goals += r.goals;
      entry.assists += r.assists;
      entry.appearances += r.appearances;
      totals.set(r.player.id, entry);
    }
    const scorers = [...totals.values()].sort((a, b) => b.goals - a.goals).slice(0, limit);
    return { team: team.name, scope: "all_seasons" as const, scorers };
  }

  let filtered = rows;
  let season = params.season ?? null;
  if (season) {
    filtered = rows.filter((r) => r.season?.year === season);
  } else {
    const latestYear = rows.reduce((max, r) => Math.max(max, r.season?.year ?? 0), 0);
    filtered = rows.filter((r) => r.season?.year === latestYear);
    season = latestYear || null;
  }

  const scorers = filtered
    .filter((r) => r.player)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)
    .map((r) => ({
      name: r.player!.full_name,
      goals: r.goals,
      assists: r.assists,
      appearances: r.appearances,
    }));

  return { team: team.name, season, scorers };
}

// ---------------------------------------------------------------------------
// get_cards
// ---------------------------------------------------------------------------
export interface CardsParams {
  team: string;
  cardType?: "yellow" | "red";
  season?: number;
  allSeasons?: boolean;
  limit?: number;
}

export async function getCards(supabase: Supabase, params: CardsParams) {
  const team = await resolveTeamOrThrow(supabase, params.team);
  if (params.season && !params.allSeasons) await assertSeasonExists(supabase, params.season);

  const rows = await fetchTeamStatistics(supabase, team.id);
  const limit = Math.min(params.limit ?? 10, 50);
  const cardType = params.cardType ?? "yellow";
  const field = cardType === "red" ? "red_cards" : "yellow_cards";

  if (params.allSeasons) {
    const totals = new Map<number, { name: string; yellow_cards: number; red_cards: number }>();
    for (const r of rows) {
      if (!r.player) continue;
      const entry = totals.get(r.player.id) ?? {
        name: r.player.full_name,
        yellow_cards: 0,
        red_cards: 0,
      };
      entry.yellow_cards += r.yellow_cards;
      entry.red_cards += r.red_cards;
      totals.set(r.player.id, entry);
    }
    const players = [...totals.values()].sort((a, b) => b[field] - a[field]).slice(0, limit);
    return { team: team.name, scope: "all_seasons" as const, cardType, players };
  }

  let filtered = rows;
  let season = params.season ?? null;
  if (season) {
    filtered = rows.filter((r) => r.season?.year === season);
  } else {
    const latestYear = rows.reduce((max, r) => Math.max(max, r.season?.year ?? 0), 0);
    filtered = rows.filter((r) => r.season?.year === latestYear);
    season = latestYear || null;
  }

  const players = filtered
    .filter((r) => r.player)
    .sort((a, b) => b[field] - a[field])
    .slice(0, limit)
    .map((r) => ({ name: r.player!.full_name, yellow_cards: r.yellow_cards, red_cards: r.red_cards }));

  return { team: team.name, season, cardType, players };
}

// ---------------------------------------------------------------------------
// get_team_facts
// ---------------------------------------------------------------------------
export async function getTeamFacts(supabase: Supabase, teamIdentifier: string) {
  const team = await resolveTeamOrThrow(supabase, teamIdentifier);

  const { data, error } = await supabase
    .from("team")
    .select(
      "name, nicknames, founded_year, short_history, website_url, venue_name, " +
        "team_trophy(competition, year), " +
        "team_legend(name, period, role, description), " +
        "team_rivalry!team_rivalry_team_id_fkey(rival_name, description)"
    )
    .eq("id", team.id)
    .single();

  if (error) throw new FootballDataError(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// get_fixtures
// ---------------------------------------------------------------------------
interface FixtureRow {
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  home: { id: number; name: string } | null;
  away: { id: number; name: string } | null;
  season: { year: number } | null;
}

export interface FixturesParams {
  team: string;
  season?: number;
  opponent?: string;
  limit?: number;
}

export async function getFixtures(supabase: Supabase, params: FixturesParams) {
  const team = await resolveTeamOrThrow(supabase, params.team);
  const limit = Math.min(params.limit ?? 10, 50);

  let opponentId: number | null = null;
  if (params.opponent) {
    const opponent = await resolveTeam(supabase, params.opponent);
    if (!opponent) throw new FootballDataError(`Okänt motståndarlag: "${params.opponent}"`);
    opponentId = opponent.id;
  }

  let query = supabase
    .from("fixture")
    .select(
      "kickoff_at, status, round, home_score, away_score, home:home_team_id(id, name), away:away_team_id(id, name), season:season_id(year)"
    )
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .order("kickoff_at", { ascending: false })
    .limit(limit);

  if (params.season) {
    await assertSeasonExists(supabase, params.season);
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("year", params.season)
      .single();
    query = query.eq("season_id", seasonRow!.id);
  }

  const { data, error } = await query.returns<FixtureRow[]>();
  if (error) throw new FootballDataError(error.message);

  let fixtures = data ?? [];
  if (opponentId) {
    fixtures = fixtures.filter((f) => f.home?.id === opponentId || f.away?.id === opponentId);
  }

  return {
    team: team.name,
    fixtures: fixtures.map((f) => ({
      date: f.kickoff_at,
      season: f.season?.year ?? null,
      round: f.round,
      status: f.status,
      home: f.home?.name ?? null,
      away: f.away?.name ?? null,
      home_score: f.home_score,
      away_score: f.away_score,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_league_facts
// ---------------------------------------------------------------------------
export async function getLeagueFacts(supabase: Supabase) {
  const { data, error } = await supabase
    .from("league")
    .select("name, country, founded_year, short_history, league_fact(label, description, year)")
    .eq("external_id", 113)
    .single();

  if (error) throw new FootballDataError(error.message);
  return data;
}
