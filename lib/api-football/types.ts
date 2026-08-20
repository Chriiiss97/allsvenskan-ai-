/**
 * Minimala typer för de fält vi faktiskt använder från API-Football v3.
 * Fullständig dokumentation: https://api-sports.io/documentation/football/v3
 */

export interface ApiLeagueResponse {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
  country: {
    name: string;
  };
  seasons: Array<{
    year: number;
    start: string;
    end: string;
    current: boolean;
  }>;
}

export interface ApiTeamResponse {
  team: {
    id: number;
    name: string;
    founded: number | null;
    logo: string;
  };
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  };
}

export interface ApiPlayerStatistic {
  team: { id: number };
  league: { id: number; season: number };
  games: {
    appearences: number | null;
    minutes: number | null;
    position: string | null;
    rating: string | null;
  };
  shots: { total: number | null; on: number | null };
  goals: { total: number | null; assists: number | null };
  cards: { yellow: number | null; red: number | null; yellowred: number | null };
  passes: { total: number | null; key: number | null; accuracy: number | null };
  tackles: { total: number | null; blocks: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null; past: number | null };
  fouls: { drawn: number | null; committed: number | null };
}

export interface ApiPlayerResponse {
  player: {
    id: number;
    firstname: string | null;
    lastname: string | null;
    name: string;
    birth: { date: string | null };
    nationality: string | null;
    photo: string | null;
  };
  statistics: ApiPlayerStatistic[];
}

export interface ApiFixtureResponse {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
    referee: string | null;
    venue: { id: number | null; name: string | null; city: string | null };
  };
  league: {
    round: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

// --- Steg 4: matchdjup (bekräftat i steg 1 mot en riktig match) ---

export interface ApiLineupPlayerEntry {
  player: {
    id: number;
    name: string;
    number: number | null;
    pos: string | null; // G/D/M/F
    grid: string | null; // "rad:kolumn", t.ex. "2:1" — null för avbytare
  };
}

export interface ApiLineupResponse {
  team: { id: number; name: string };
  coach: { id: number; name: string } | null;
  formation: string | null;
  startXI: ApiLineupPlayerEntry[];
  substitutes: ApiLineupPlayerEntry[];
}

export interface ApiFixtureStatisticsResponse {
  team: { id: number; name: string };
  statistics: { type: string; value: string | number | null }[];
}

interface ApiFixturePlayerStat {
  games: {
    minutes: number | null;
    number: number | null;
    position: string | null;
    rating: string | null;
    captain: boolean | null;
    substitute: boolean | null;
  };
  offsides: number | null;
  shots: { total: number | null; on: number | null };
  goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
  passes: { total: number | null; key: number | null; accuracy: string | number | null };
  tackles: { total: number | null; blocks: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null; past: number | null };
  fouls: { drawn: number | null; committed: number | null };
  cards: { yellow: number | null; red: number | null };
  penalty: {
    won: number | null;
    commited: number | null; // API:ts egen stavning, inte vår — bevarad medvetet
    scored: number | null;
    missed: number | null;
    saved: number | null;
  };
}

export interface ApiFixturePlayersResponse {
  team: { id: number; name: string };
  players: { player: { id: number; name: string }; statistics: ApiFixturePlayerStat[] }[];
}

export interface ApiEventResponse {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number | null };
  assist: { id: number | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string;
  comments: string | null;
}

interface ApiStandingsRecord {
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goals: { for: number | null; against: number | null };
}

export interface ApiStandingsTeamRow {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number | null;
  group: string | null;
  form: string | null;
  all: ApiStandingsRecord;
  home: ApiStandingsRecord;
  away: ApiStandingsRecord;
}

export interface ApiStandingsResponse {
  league: {
    id: number;
    season: number;
    // Nästlat en gång till: en array PER GRUPP (för Allsvenskan bara en grupp,
    // men API:t har samma form för ligor med kval-/slutspelsgrupper).
    standings: ApiStandingsTeamRow[][];
  };
}

// Bekräftat i steg 1: /coachs ger karriärhistorik (lag+datumintervall) per
// tränare. OBS — samma steg hittade två separata poster för vad som verkar
// vara SAMMA verkliga person (olika id, en rik/en nästan tom). Vi importerar
// varje rad rakt av (external_id är API:ts egen, unika nyckel) och löser
// eventuell "samma person"-sammanslagning som en senare, egen analysfråga —
// inte något vi gissar oss till vid inmatning.
export interface ApiCoachResponse {
  id: number;
  name: string;
  firstname: string | null;
  lastname: string | null;
  nationality: string | null;
  birth: { date: string | null };
  photo: string | null;
  team: { id: number; name: string } | null;
}
