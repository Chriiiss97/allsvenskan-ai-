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
    name: string | null;
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
    venue: { name: string | null };
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

export interface ApiEventResponse {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number | null };
  assist: { id: number | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string;
  comments: string | null;
}
