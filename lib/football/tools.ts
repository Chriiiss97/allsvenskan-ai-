import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveTeam } from "./resolve-team";
import { resolvePlayer } from "./resolve-player";
import { hasPlayedSeason } from "./active-player";
import { getPositionGroup, selectPeers, type PeerGroupSummary } from "./position-group";
import { computeEventsComplete } from "./match-completeness";

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
export interface TeamFactsRow {
  name: string;
  nicknames: string[];
  founded_year: number | null;
  short_history: string | null;
  website_url: string | null;
  venue_name: string | null;
  team_trophy: { competition: string; year: number }[];
  team_legend: { name: string; period: string | null; role: string | null; description: string | null }[];
  team_rivalry: { rival_name: string | null; description: string | null }[];
}

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
    .single<TeamFactsRow>();

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

  // Motståndarfiltret måste vara en del av SQL-villkoret (inte ett filter i
  // JS efter .limit()) — annars kapar .limit() bort matcherna mot just den
  // motståndaren innan vi ens hunnit titta på dem (t.ex. "senaste derbyt"
  // med limit=1 gav träff på lagets absolut senaste match oavsett
  // motståndare, som sen filtrerades bort och gav ett tomt resultat även
  // fast äldre inbördes möten fanns i databasen).
  const matchupFilter = opponentId
    ? `and(home_team_id.eq.${team.id},away_team_id.eq.${opponentId}),and(home_team_id.eq.${opponentId},away_team_id.eq.${team.id})`
    : `home_team_id.eq.${team.id},away_team_id.eq.${team.id}`;

  let query = supabase
    .from("fixture")
    .select(
      "kickoff_at, status, round, home_score, away_score, home:home_team_id(id, name), away:away_team_id(id, name), season:season_id(year)"
    )
    .or(matchupFilter)
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

  const fixtures = data ?? [];

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
  current_team: { id: number; name: string; logo_url: string | null; external_id: number | null } | null;
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

interface PeerRow {
  minutes_played: number;
  goals: number;
  assists: number;
  passes_total: number | null;
  passes_key: number | null;
  tackles_total: number | null;
  tackles_interceptions: number | null;
  duels_total: number | null;
  duels_won: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  player: { position: string | null } | null;
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
        "current_team:current_team_id(id, name, logo_url, external_id)"
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

  // Bara säsonger spelaren faktiskt spelade (se lib/football/active-player.ts)
  // erbjuds i säsongsväljaren — annars kunde man landa på en "spökssäsong"
  // där raden bara betyder "registrerad", inte "spelade".
  const availableSeasons = [
    ...new Set(
      rows
        .filter((r) => hasPlayedSeason(r.appearances))
        .map((r) => r.season?.year)
        .filter((y): y is number => Boolean(y))
    ),
  ].sort((a, b) => b - a);

  if (availableSeasons.length === 0) {
    throw new FootballDataError(`${bio.full_name} har inte spelat en enda match i någon importerad säsong.`);
  }

  let seasonYear = params.season ?? availableSeasons[0] ?? null;
  const row = rows.find((r) => r.season?.year === seasonYear);
  if (!row) {
    throw new FootballDataError(`Ingen statistik för ${bio.full_name} säsong ${seasonYear}.`);
  }
  seasonYear = row.season?.year ?? seasonYear;

  // Positionssnitt: en anfallares FÖRSVARSsiffror ska jämföras med ANDRA
  // ANFALLARE, inte med en pool som blandar in målvakter (~0 tacklingar/90)
  // och försvarare (nästan alltid höga tacklingssiffror) — annars blir
  // "bättre än snittet" en artefakt av vem som råkar vara i poolen, inte ett
  // verkligt uttalande om spelaren. Se lib/football/position-group.ts.
  // Poolen nedan filtrerar bara på league_id+season_id — sedan steg 3/4:s
  // breddning till 33 lag (2026-08-20) är det alltså HELA Allsvenskan den
  // säsongen, inte bara IFK/AIK (verifierat i steg 8: t.ex. 65 anfallare med
  // ≥450 minuter 2022, mot en handfull om poolen fortfarande var IFK/AIK).
  const positionGroupInfo = getPositionGroup(bio.position);

  const { data: peerRowsRaw } = await supabase
    .from("statistics")
    .select(
      "minutes_played, goals, assists, passes_total, passes_key, tackles_total, tackles_interceptions, duels_total, duels_won, dribbles_attempts, dribbles_success, player:player_id(position)"
    )
    .eq("league_id", row.league_id)
    .eq("season_id", row.season_id)
    .gt("minutes_played", 0)
    .neq("player_id", resolved.id)
    .returns<PeerRow[]>();

  const allPeers = peerRowsRaw ?? [];
  const samePosition = positionGroupInfo
    ? allPeers.filter((p) => getPositionGroup(p.player?.position)?.group === positionGroupInfo.group)
    : allPeers;
  const { peers: peerRows, summary: peerGroupBase } = selectPeers(
    samePosition,
    positionGroupInfo?.label ?? "spelare",
    row.minutes_played
  );
  const peerGroup: PeerGroupSummary = peerGroupBase;

  // Samma camelCase-nycklar som per90-objektet nedan, så UI-komponenter kan
  // slå upp samma fältnamn i båda utan att behöva mappa mellan konventioner.
  const positionAveragePer90 = {
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
      shotsTotal: per90(row.shots_total, row.minutes_played),
      shotsOnTarget: per90(row.shots_on_target, row.minutes_played),
      passesTotal: per90(row.passes_total, row.minutes_played),
      passesKey: per90(row.passes_key, row.minutes_played),
      tacklesTotal: per90(row.tackles_total, row.minutes_played),
      tacklesBlocks: per90(row.tackles_blocks, row.minutes_played),
      tacklesInterceptions: per90(row.tackles_interceptions, row.minutes_played),
      duelsWon: per90(row.duels_won, row.minutes_played),
      dribblesSuccess: per90(row.dribbles_success, row.minutes_played),
    },
    // Vinstprocent i dueller — en ren kvot, behöver ingen per-90-normalisering.
    duelsWinRate:
      row.duels_total && row.duels_total > 0 && row.duels_won !== null
        ? Math.round(((row.duels_won / row.duels_total) * 100 + Number.EPSILON) * 10) / 10
        : null,
    positionAveragePer90,
    peerGroup,
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

// ---------------------------------------------------------------------------
// compare_players — Data-sektion del 2
// ---------------------------------------------------------------------------
export interface ComparePlayersParams {
  playerA: string;
  playerB: string;
  season?: number;
}

/**
 * Återanvänder getPlayerProfile för båda spelarna istället för att duplicera
 * frågelogiken. Om season inte anges väljer varje spelare sin egen senaste
 * säsong självständigt — de kan skilja sig, UI:t ansvarar för att visa vilken
 * säsong varje sida gäller.
 */
export async function comparePlayers(supabase: Supabase, params: ComparePlayersParams) {
  const [a, b] = await Promise.all([
    getPlayerProfile(supabase, { player: params.playerA, season: params.season }),
    getPlayerProfile(supabase, { player: params.playerB, season: params.season }),
  ]);
  return { playerA: a, playerB: b };
}

// ---------------------------------------------------------------------------
// compare_teams — Data-sektion del 2 (resultatbaserat, hela ligan sedan
// data-sektionens breddning 2026-08-20 — tidigare begränsat till IFK/AIK via
// en konstant som blivit sakligt fel: fullt matchdjup finns nu för alla 33 lag)
// ---------------------------------------------------------------------------

interface ComparisonFixtureRow {
  id: number;
  external_id: number | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_id: number;
  away_team_id: number;
  season: { year: number } | null;
}

function computeFormRecord(
  fixtures: ComparisonFixtureRow[],
  teamId: number
): {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: Array<"W" | "D" | "L">;
} {
  const finished = fixtures
    .filter((f) => f.status === "FT" && f.home_score !== null && f.away_score !== null)
    .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const form: Array<"W" | "D" | "L"> = [];

  for (const f of finished) {
    const isHome = f.home_team_id === teamId;
    const gf = (isHome ? f.home_score : f.away_score) ?? 0;
    const ga = (isHome ? f.away_score : f.home_score) ?? 0;
    goalsFor += gf;
    goalsAgainst += ga;
    let result: "W" | "D" | "L";
    if (gf > ga) {
      wins += 1;
      result = "W";
    } else if (gf === ga) {
      draws += 1;
      result = "D";
    } else {
      losses += 1;
      result = "L";
    }
    form.push(result);
  }

  return {
    played: finished.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    points: wins * 3 + draws,
    form: form.slice(-5),
  };
}

export interface TeamComparisonParams {
  teamA: string;
  teamB: string;
  season?: number;
}

export async function getTeamComparison(supabase: Supabase, params: TeamComparisonParams) {
  const teamA = await resolveTeamOrThrow(supabase, params.teamA);
  const teamB = await resolveTeamOrThrow(supabase, params.teamB);

  let seasonYear = params.season ?? null;
  let seasonId: number | null = null;
  if (seasonYear) {
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("year", seasonYear)
      .maybeSingle();
    if (!seasonRow) throw new FootballDataError(`Ingen data för säsong ${seasonYear}`);
    seasonId = seasonRow.id;
  }

  async function fetchTeamFixtures(teamId: number) {
    let query = supabase
      .from("fixture")
      .select(
        "id, external_id, kickoff_at, status, home_score, away_score, home_team_id, away_team_id, season:season_id(year)"
      )
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("kickoff_at", { ascending: false });
    if (seasonId) query = query.eq("season_id", seasonId);
    const { data, error } = await query.returns<ComparisonFixtureRow[]>();
    if (error) throw new FootballDataError(error.message);
    return data ?? [];
  }

  const [fixturesA, fixturesB, h2h] = await Promise.all([
    fetchTeamFixtures(teamA.id),
    fetchTeamFixtures(teamB.id),
    supabase
      .from("fixture")
      .select(
        "id, kickoff_at, status, home_score, away_score, home_team_id, away_team_id, round, season:season_id(year), home:home_team_id(name), away:away_team_id(name)"
      )
      .or(
        `and(home_team_id.eq.${teamA.id},away_team_id.eq.${teamB.id}),and(home_team_id.eq.${teamB.id},away_team_id.eq.${teamA.id})`
      )
      .order("kickoff_at", { ascending: false }),
  ]);

  // Om ingen säsong angavs hämtades fixturesA/B ovan för ALLA säsonger —
  // filtrera nu ner till den senaste, annars skulle formkurvan/poängen bli
  // en felaktig summering över flera säsonger.
  let scopedFixturesA = fixturesA;
  let scopedFixturesB = fixturesB;
  if (!seasonYear) {
    seasonYear = fixturesA[0]?.season?.year ?? fixturesB[0]?.season?.year ?? null;
    if (seasonYear) {
      scopedFixturesA = fixturesA.filter((f) => f.season?.year === seasonYear);
      scopedFixturesB = fixturesB.filter((f) => f.season?.year === seasonYear);
    }
  }

  const h2hFixtures = (h2h.data ?? []) as unknown as Array<{
    id: number;
    kickoff_at: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    home_team_id: number;
    round: string | null;
    season: { year: number } | null;
    home: { name: string } | null;
    away: { name: string } | null;
  }>;

  const h2hRecord = { teamAWins: 0, teamBWins: 0, draws: 0 };
  for (const f of h2hFixtures) {
    if (f.status !== "FT" || f.home_score === null || f.away_score === null) continue;
    const homeIsA = f.home_team_id === teamA.id;
    if (f.home_score === f.away_score) h2hRecord.draws += 1;
    else if ((f.home_score > f.away_score) === homeIsA) h2hRecord.teamAWins += 1;
    else h2hRecord.teamBWins += 1;
  }

  return {
    season: seasonYear,
    teamA: { name: teamA.name, externalId: teamA.external_id, ...computeFormRecord(scopedFixturesA, teamA.id) },
    teamB: { name: teamB.name, externalId: teamB.external_id, ...computeFormRecord(scopedFixturesB, teamB.id) },
    headToHead: {
      record: h2hRecord,
      matches: h2hFixtures.map((f) => ({
        date: f.kickoff_at,
        season: f.season?.year ?? null,
        round: f.round,
        status: f.status,
        home: f.home?.name ?? null,
        away: f.away?.name ?? null,
        homeScore: f.home_score,
        awayScore: f.away_score,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// getTeamProfile — Data-sektionen "Ett lag". Bara UI-lagret (app/(app)/data/
// teams), inget Claude-verktyg — så inget tool-definitions-tillägg behövs.
// Återanvänder computeFormRecord (samma som getTeamComparison), getFixtures
// och getTeamFacts rakt av istället för att duplicera deras frågor.
// ---------------------------------------------------------------------------
export interface TeamProfileParams {
  team: string;
  season?: number;
}

export async function getTeamProfile(supabase: Supabase, params: TeamProfileParams) {
  const team = await resolveTeamOrThrow(supabase, params.team);

  let seasonYear = params.season ?? null;
  let seasonId: number | null = null;
  if (seasonYear) {
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("year", seasonYear)
      .maybeSingle();
    if (!seasonRow) throw new FootballDataError(`Ingen data för säsong ${seasonYear}`);
    seasonId = seasonRow.id;
  }

  let fixturesQuery = supabase
    .from("fixture")
    .select(
      "id, external_id, kickoff_at, status, home_score, away_score, home_team_id, away_team_id, season:season_id(year)"
    )
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .order("kickoff_at", { ascending: false });
  if (seasonId) fixturesQuery = fixturesQuery.eq("season_id", seasonId);
  const { data: fixturesData, error: fixturesError } = await fixturesQuery.returns<ComparisonFixtureRow[]>();
  if (fixturesError) throw new FootballDataError(fixturesError.message);
  const allFixtures = fixturesData ?? [];

  // Ingen säsong angiven -> samma "senaste importerade säsong"-logik som
  // getTeamComparison, av samma skäl (annars blandas flera säsonger ihop).
  let scopedFixtures = allFixtures;
  if (!seasonYear) {
    seasonYear = allFixtures[0]?.season?.year ?? null;
    if (seasonYear) scopedFixtures = allFixtures.filter((f) => f.season?.year === seasonYear);
  }

  // seasonId sattes bara ovan om params.season gavs explicit — om
  // seasonYear istället kom från fallbacken behöver vi slå upp id:t här,
  // annars kan inte truppfrågan nedan filtrera på season_id.
  if (!seasonId && seasonYear) {
    const { data: resolvedSeasonRow } = await supabase.from("season").select("id").eq("year", seasonYear).maybeSingle();
    seasonId = resolvedSeasonRow?.id ?? null;
  }

  const record = computeFormRecord(scopedFixtures, team.id);

  const [squadStatsResult, scorersResult, facts, { data: logoRow }, recentFixtures] = await Promise.all([
    // Trupp = spelare som faktiskt spelade för LAGET DEN säsongen (se
    // lib/football/active-player.ts) — inte player.current_team_id, som
    // bara säger vilken klubb spelaren råkar tillhöra IDAG och varken
    // respekterar vald säsong eller om de faktiskt kom till en match.
    seasonId
      ? supabase
          .from("statistics")
          .select("appearances, player:player_id(id, full_name, position, photo_url)")
          .eq("team_id", team.id)
          .eq("season_id", seasonId)
          .returns<
            { appearances: number; player: { id: number; full_name: string; position: string | null; photo_url: string | null } | null }[]
          >()
      : Promise.resolve({ data: [] as { appearances: number; player: { id: number; full_name: string; position: string | null; photo_url: string | null } | null }[] }),
    getTopScorers(supabase, { team: team.name, season: seasonYear ?? undefined, limit: 50 }),
    getTeamFacts(supabase, team.name),
    supabase.from("team").select("logo_url").eq("id", team.id).single<{ logo_url: string | null }>(),
    getFixtures(supabase, { team: team.name, season: seasonYear ?? undefined, limit: 5 }),
  ]);

  // En spelare kan ha flera statistikrader samma säsong (t.ex. olika
  // league_id för cup/liga) — dedupe per spelare, håll om NÅGON rad visar
  // att de faktiskt spelade.
  const squadByPlayer = new Map<
    number,
    { id: number; full_name: string; position: string | null; photo_url: string | null }
  >();
  for (const row of squadStatsResult.data ?? []) {
    if (!row.player || !hasPlayedSeason(row.appearances)) continue;
    squadByPlayer.set(row.player.id, row.player);
  }
  const squad = [...squadByPlayer.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "sv"));

  const scorers = scorersResult.scorers;
  const topScorer = scorers.length > 0 ? scorers[0] : null;
  const topAssist = scorers.length > 0 ? [...scorers].sort((a, b) => b.assists - a.assists)[0] : null;

  return {
    team: { name: team.name, externalId: team.external_id, logoUrl: logoRow?.logo_url ?? null },
    season: seasonYear,
    record,
    squad: squad.map((p) => ({
      id: p.id,
      name: p.full_name,
      position: p.position,
      photoUrl: p.photo_url,
    })),
    topScorer: topScorer ? { name: topScorer.name, goals: topScorer.goals } : null,
    topAssist: topAssist && topAssist.assists > 0 ? { name: topAssist.name, assists: topAssist.assists } : null,
    recentMatches: recentFixtures.fixtures,
    facts,
  };
}

// ---------------------------------------------------------------------------
// get_match_report — Data-sektion del 2
// ---------------------------------------------------------------------------
interface MatchEventRow {
  type: string;
  detail: string | null;
  minute: number;
  extra_minute: number | null;
  team: { id: number; name: string } | null;
  player: { full_name: string } | null;
  assist: { full_name: string } | null;
}

export async function getMatchReport(supabase: Supabase, fixtureId: number) {
  const { data: fixture, error: fixtureError } = await supabase
    .from("fixture")
    .select(
      "id, external_id, kickoff_at, status, round, venue_name, home_score, away_score, events_synced_at, " +
        "home:home_team_id(id, external_id, name, logo_url), away:away_team_id(id, external_id, name, logo_url), season:season_id(year)"
    )
    .eq("id", fixtureId)
    .single<{
      id: number;
      external_id: number | null;
      kickoff_at: string;
      status: string;
      round: string | null;
      venue_name: string | null;
      home_score: number | null;
      away_score: number | null;
      events_synced_at: string | null;
      home: { id: number; external_id: number | null; name: string; logo_url: string | null } | null;
      away: { id: number; external_id: number | null; name: string; logo_url: string | null } | null;
      season: { year: number } | null;
    }>();

  if (fixtureError || !fixture) throw new FootballDataError(`Okänd match: ${fixtureId}`);

  let events: MatchEventRow[] = [];
  if (fixture.events_synced_at) {
    const { data, error } = await supabase
      .from("event")
      .select(
        "type, detail, minute, extra_minute, team:team_id(id, name), player:player_id(full_name), assist:assist_player_id(full_name)"
      )
      .eq("fixture_id", fixture.id)
      .order("minute", { ascending: true })
      .returns<MatchEventRow[]>();
    if (error) throw new FootballDataError(error.message);
    events = data ?? [];
  }

  // Tidigare en hårdkodad IFK/AIK-gate (numera sakligt fel — spelartrupper
  // importerade för alla 33 lag sedan data-sektionens breddning). Mäter nu
  // istället riktigt: resolverade varje mål/kort/byte en spelare, eller
  // finns det events där player_id fanns i källan men inte kunde kopplas
  // till en rad i vår player-tabell (samma "team-namn utan spelarnamn"-fall
  // MatchTimeline redan har en egen visuell fallback för, per event). "var"
  // saknar ibland legitimt en spelare i källan — undantaget här, inte ett
  // tecken på ofullständig import.
  const fullPlayerDetail =
    events.length === 0 || events.every((e) => e.type === "var" || e.player !== null);

  // Delad med steg 7:s finalize-match.ts (lib/football/match-completeness.ts)
  // — samma avstämningslogik oavsett om den körs vid läsning (här) eller i
  // batch efter en match (finalize-match.ts, loggat till ingestion_log).
  const eventsComplete = computeEventsComplete(
    { status: fixture.status, home_score: fixture.home_score, away_score: fixture.away_score, home_team_id: fixture.home?.id ?? null },
    events.map((e) => ({ type: e.type, detail: e.detail, team_id: e.team?.id ?? null }))
  );

  return {
    id: fixture.id,
    date: fixture.kickoff_at,
    season: fixture.season?.year ?? null,
    round: fixture.round,
    status: fixture.status,
    venue: fixture.venue_name,
    home: fixture.home ? { name: fixture.home.name, logoUrl: fixture.home.logo_url } : null,
    away: fixture.away ? { name: fixture.away.name, logoUrl: fixture.away.logo_url } : null,
    homeScore: fixture.home_score,
    awayScore: fixture.away_score,
    eventsAvailable: !!fixture.events_synced_at,
    eventsComplete,
    fullPlayerDetail,
    events: events.map((e) => ({
      type: e.type,
      detail: e.detail,
      minute: e.minute,
      extraMinute: e.extra_minute,
      team: e.team?.name ?? null,
      player: e.player?.full_name ?? null,
      assist: e.assist?.full_name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_match_report (chattverktyg) — löser lag(+motståndare, +säsong) till
// den senaste avslutade matchen och återanvänder getMatchReport rakt av.
// Samma matchup-filter i SQL:en som getFixtures (INTE ett JS-filter efter
// .limit() — det var precis den buggen som gjorde att "senaste derbyt"
// kunde ge tomt resultat trots att möten fanns, se tidigare fix).
// ---------------------------------------------------------------------------
export interface MatchReportForTeamsParams {
  team: string;
  opponent?: string;
  season?: number;
}

export async function getMatchReportForTeams(supabase: Supabase, params: MatchReportForTeamsParams) {
  const team = await resolveTeamOrThrow(supabase, params.team);

  let opponentId: number | null = null;
  if (params.opponent) {
    const opponent = await resolveTeam(supabase, params.opponent);
    if (!opponent) throw new FootballDataError(`Okänt motståndarlag: "${params.opponent}"`);
    opponentId = opponent.id;
  }

  const matchupFilter = opponentId
    ? `and(home_team_id.eq.${team.id},away_team_id.eq.${opponentId}),and(home_team_id.eq.${opponentId},away_team_id.eq.${team.id})`
    : `home_team_id.eq.${team.id},away_team_id.eq.${team.id}`;

  let query = supabase
    .from("fixture")
    .select("id")
    .or(matchupFilter)
    .eq("status", "FT")
    .order("kickoff_at", { ascending: false })
    .limit(1);

  if (params.season) {
    await assertSeasonExists(supabase, params.season);
    const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).single();
    query = query.eq("season_id", seasonRow!.id);
  }

  const { data, error } = await query.returns<{ id: number }[]>();
  if (error) throw new FootballDataError(error.message);

  const fixture = data?.[0];
  if (!fixture) {
    throw new FootballDataError(
      opponentId
        ? `Hittade ingen avslutad match mellan ${team.name} och ${params.opponent}.`
        : `Hittade ingen avslutad match för ${team.name}${params.season ? ` säsongen ${params.season}` : ""}.`
    );
  }

  return getMatchReport(supabase, fixture.id);
}
