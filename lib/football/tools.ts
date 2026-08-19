import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveTeam } from "./resolve-team";
import { resolvePlayer } from "./resolve-player";

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
// get_player_profile — Data-sektion del 1
// ---------------------------------------------------------------------------
interface PlayerBioRow {
  id: number;
  full_name: string;
  position: string | null;
  birth_date: string | null;
  nationality: string | null;
  photo_url: string | null;
  current_team: { id: number; name: string; logo_url: string | null } | null;
}

interface PlayerStatsRow {
  season_id: number;
  league_id: number;
  team_id: number;
  team: { id: number; name: string; logo_url: string | null } | null;
  season: { year: number } | null;
  appearances: number;
  minutes_played: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  rating: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  passes_total: number | null;
  passes_key: number | null;
  passes_accuracy: number | null;
  tackles_total: number | null;
  tackles_blocks: number | null;
  tackles_interceptions: number | null;
  duels_total: number | null;
  duels_won: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  fouls_drawn: number | null;
  fouls_committed: number | null;
}

const PLAYER_STATS_SELECT =
  "season_id, league_id, team_id, appearances, minutes_played, goals, assists, " +
  "yellow_cards, red_cards, rating, shots_total, shots_on_target, passes_total, " +
  "passes_key, passes_accuracy, tackles_total, tackles_blocks, tackles_interceptions, " +
  "duels_total, duels_won, dribbles_attempts, dribbles_success, fouls_drawn, fouls_committed, " +
  "team:team_id(id, name, logo_url), season:season_id(year)";

/** Per-90-frekvens. null om vi saknar data eller spelaren inte spelat några minuter. */
function per90(value: number | null, minutes: number): number | null {
  if (value === null || minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round(((nums.reduce((a, b) => a + b, 0) / nums.length) + Number.EPSILON) * 10) / 10;
}

export interface PlayerProfileParams {
  player: string; // internt id, external_id, eller (del av) namn
  season?: number;
}

export async function getPlayerProfile(supabase: Supabase, params: PlayerProfileParams) {
  const resolved = await resolvePlayer(supabase, params.player);
  if (!resolved) throw new FootballDataError(`Okänd spelare: "${params.player}"`);

  const { data: bio, error: bioError } = await supabase
    .from("player")
    .select(
      "id, full_name, position, birth_date, nationality, photo_url, " +
        "current_team:current_team_id(id, name, logo_url)"
    )
    .eq("id", resolved.id)
    .single<PlayerBioRow>();
  if (bioError || !bio) throw new FootballDataError(`Kunde inte hämta spelarbio för "${params.player}".`);

  const { data: allStats, error: statsError } = await supabase
    .from("statistics")
    .select(PLAYER_STATS_SELECT)
    .eq("player_id", resolved.id)
    .returns<PlayerStatsRow[]>();
  if (statsError) throw new FootballDataError(statsError.message);

  const rows = allStats ?? [];
  if (rows.length === 0) {
    throw new FootballDataError(`Ingen statistik hittad för ${bio.full_name}.`);
  }

  const availableSeasons = [...new Set(rows.map((r) => r.season?.year).filter((y): y is number => Boolean(y)))].sort(
    (a, b) => b - a
  );

  let seasonYear = params.season ?? availableSeasons[0] ?? null;
  const row = rows.find((r) => r.season?.year === seasonYear);
  if (!row) {
    throw new FootballDataError(`Ingen statistik för ${bio.full_name} säsong ${seasonYear}.`);
  }
  seasonYear = row.season?.year ?? seasonYear;

  // Ligasnitt: per-90-genomsnitt över alla spelare i vår databas (IFK+AIK)
  // för samma liga+säsong — en verklig, uträknad siffra (AVG), inte påhittad.
  // OBS: bara vår spelarpool (IFK/AIK), inte hela Allsvenskan — markeras
  // tydligt i UI:t.
  const { data: peers } = await supabase
    .from("statistics")
    .select(
      "minutes_played, goals, assists, passes_total, passes_key, tackles_total, tackles_interceptions, duels_total, duels_won, dribbles_attempts, dribbles_success"
    )
    .eq("league_id", row.league_id)
    .eq("season_id", row.season_id)
    .gt("minutes_played", 0);

  const peerRows = peers ?? [];
  // Samma camelCase-nycklar som per90-objektet nedan, så UI-komponenter kan
  // slå upp samma fältnamn i båda utan att behöva mappa mellan konventioner.
  const leagueAveragePer90 = {
    goals: average(peerRows.map((p) => per90(p.goals, p.minutes_played))),
    assists: average(peerRows.map((p) => per90(p.assists, p.minutes_played))),
    passesTotal: average(peerRows.map((p) => per90(p.passes_total, p.minutes_played))),
    passesKey: average(peerRows.map((p) => per90(p.passes_key, p.minutes_played))),
    tacklesTotal: average(peerRows.map((p) => per90(p.tackles_total, p.minutes_played))),
    tacklesInterceptions: average(peerRows.map((p) => per90(p.tackles_interceptions, p.minutes_played))),
    duelsWon: average(peerRows.map((p) => per90(p.duels_won, p.minutes_played))),
    dribblesSuccess: average(peerRows.map((p) => per90(p.dribbles_success, p.minutes_played))),
  };

  return {
    player: {
      id: bio.id,
      name: bio.full_name,
      position: bio.position,
      birthDate: bio.birth_date,
      nationality: bio.nationality,
      photoUrl: bio.photo_url,
      team: bio.current_team,
    },
    season: seasonYear,
    availableSeasons,
    stats: {
      appearances: row.appearances,
      minutesPlayed: row.minutes_played,
      goals: row.goals,
      assists: row.assists,
      yellowCards: row.yellow_cards,
      redCards: row.red_cards,
      rating: row.rating,
      shotsTotal: row.shots_total,
      shotsOnTarget: row.shots_on_target,
      passesTotal: row.passes_total,
      passesKey: row.passes_key,
      passesAccuracy: row.passes_accuracy,
      tacklesTotal: row.tackles_total,
      tacklesBlocks: row.tackles_blocks,
      tacklesInterceptions: row.tackles_interceptions,
      duelsTotal: row.duels_total,
      duelsWon: row.duels_won,
      dribblesAttempts: row.dribbles_attempts,
      dribblesSuccess: row.dribbles_success,
      foulsDrawn: row.fouls_drawn,
      foulsCommitted: row.fouls_committed,
    },
    per90: {
      goals: per90(row.goals, row.minutes_played),
      assists: per90(row.assists, row.minutes_played),
      passesTotal: per90(row.passes_total, row.minutes_played),
      passesKey: per90(row.passes_key, row.minutes_played),
      tacklesTotal: per90(row.tackles_total, row.minutes_played),
      tacklesInterceptions: per90(row.tackles_interceptions, row.minutes_played),
      duelsWon: per90(row.duels_won, row.minutes_played),
      dribblesSuccess: per90(row.dribbles_success, row.minutes_played),
    },
    leagueAveragePer90,
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
