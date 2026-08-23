import "server-only";
import { cachedRead, createAnonClient } from "@/lib/cache/server-cache";
import { getPlayersWhoLeftAllsvenskan, getMostDecoratedAbroad, type PostAllsvenskanPlayer, type DecoratedAbroadEntry } from "./post-allsvenskan";
import { getIncomingTransfers, type IncomingSigning } from "./incoming-transfers";
import { getAvailableSeasons, listTeams, listTeamsWithSeasonSummary, type SeasonOption, type TeamOption, type TeamOverviewRow } from "./catalog";
import { getStandingsView, type StandingsFilter, type StandingsViewRow } from "./standings-views";
import { listPlayers, type PlayerListParams, type PlayerListResult } from "./player-catalog";
import { searchScoutPlayers, type ScoutSearchParams, type ScoutSearchResultRow } from "./rating/scout-search";
import { getTopScorers } from "./tools";

/**
 * PRESTANDA (2026-08-23) — cachade ingångar till de tyngsta PUBLIKA
 * läsningarna. Se lib/cache/server-cache.ts för varför cachen har två lager
 * och varför det är säkert att dela resultatet mellan besökare.
 *
 * ⚠️ VERSIONSNUMRET I NYCKELN ÄR INTE DEKORATION. Det som ligger i cachen
 * är det FÄRDIGA svaret, inte rådata — ändrar man hur ett fält räknas ut
 * fortsätter gamla poster att serveras med det gamla värdet tills de
 * revalideras. Verkligt fall (2026-08-23): när spelarnamnen gick över till
 * "Tilltalsnamn Efternamn" stod "Carl Mikael Lustig" kvar i Efter
 * Allsvenskan-korten trots att koden redan gav "Mikael Lustig". Höj därför
 * `-vN` på VARJE nyckel vars innehåll ändrar betydelse — det ger en ny
 * post direkt istället för att vänta ut en revalidering.
 *
 * Reglen för vad som får ligga här: funktionen ska vara REN (samma svar för
 * alla inloggade), bygga sin egen anon-klient, och returnera vanliga
 * objekt/arrayer. Allt användarnära — profil, bevakningslista, kvot, admin —
 * frågas fortfarande per request i respektive page.tsx.
 */

/**
 * Efter Allsvenskan. Den absolut dyraste läsningen i appen: fyra hela
 * tabeller (8 855 kB rådata, 43 sidor) som räknas ner till 928 spelare.
 * Uppmätt 1,1–1,6s per anrop före cachen — och den kördes om vid VARJE
 * navigering till sidan, inklusive Sidebar:ns prefetch.
 */
export const getCachedPostAllsvenskanPlayers = cachedRead(
  "post-allsvenskan-players-v2",
  async (): Promise<PostAllsvenskanPlayer[]> => getPlayersWhoLeftAllsvenskan(createAnonClient()),
  { tags: ["post-allsvenskan"] }
);

/**
 * Fas 22 (2026-08-23) — "Värvningar till Allsvenskan", spegelbilden ovan.
 * Läser fyra hela tabeller (transferhändelser, karriärstints, allsvensk
 * statistik, spelare — uppmätt ~670ms) och är, precis som Efter
 * Allsvenskan, identisk för alla besökare mellan importkörningar.
 */
export const getCachedIncomingTransfers = cachedRead(
  "incoming-transfers-v2",
  async (): Promise<IncomingSigning[]> => getIncomingTransfers(createAnonClient()),
  { tags: ["post-allsvenskan", "players"] }
);

/**
 * "Mest dekorerad utomlands" läser hela player_trophy och behöver samma
 * spelarmängd som ovan. Den tar därför INTE emot `players` som argument
 * (en 1,5 MB array går inte att ha i en cache-nyckel) utan hämtar den
 * cachade mängden själv — vilket i praktiken alltid är en cache-träff,
 * eftersom sidan efterfrågar båda samtidigt.
 */
export const getCachedMostDecoratedAbroad = cachedRead(
  "post-allsvenskan-decorated-v2",
  async (): Promise<DecoratedAbroadEntry[]> => {
    const supabase = createAnonClient();
    const players = await getCachedPostAllsvenskanPlayers();
    return getMostDecoratedAbroad(supabase, players);
  },
  { tags: ["post-allsvenskan"] }
);

/**
 * Säsongslistan och lagkatalogen läses av nästan varje sida (matcher, lag,
 * spelare, tabell, scout-sök, jämför) och ändras bara när en ny säsong
 * importeras. Två små men ALLTID förekommande round-trips per navigering.
 */
export const getCachedSeasons = cachedRead(
  "catalog-seasons-v1",
  async (): Promise<SeasonOption[]> => getAvailableSeasons(createAnonClient()),
  { revalidate: 3600, ttlMs: 10 * 60_000, tags: ["catalog"] }
);

export const getCachedTeams = cachedRead(
  "catalog-teams-v1",
  async (): Promise<TeamOption[]> => listTeams(createAnonClient()),
  { revalidate: 3600, ttlMs: 10 * 60_000, tags: ["catalog"] }
);

/**
 * Laglistan med tabellplacering (/lag). Kedjan bakom den är fyra
 * round-trips i rad — lagkatalog → säsongsuppslag → standings → dedup —
 * och den kördes om vid varje besök trots att svaret är identiskt för alla.
 */
export const getCachedTeamsWithSeasonSummary = cachedRead(
  "teams-season-summary-v1",
  async (season?: number): Promise<TeamOverviewRow[]> =>
    listTeamsWithSeasonSummary(createAnonClient(), { season }),
  { tags: ["catalog", "standings"] }
);

/** Serietabellen — en aggregering över hela säsongens matcher, per flik. */
export const getCachedStandingsView = cachedRead(
  "standings-view-v1",
  async (season: number, filter: StandingsFilter): Promise<StandingsViewRow[]> =>
    getStandingsView(createAnonClient(), { season, filter }),
  { tags: ["standings"] }
);

/**
 * Spelarlistan för /spelare och /scout/spelare. Bakom den ligger
 * computeSeasonOvrMap, som paginerar hela säsongens fixture_player_stats
 * (80 240 rader i tabellen) — den dyraste läsningen efter Efter Allsvenskan.
 *
 * Sidorna skickar med flit INGA filterparametrar (de filtrerar i webbläsaren,
 * se kommentaren i app/(app)/(content)/spelare/page.tsx) — cache-nyckeln blir
 * därför i praktiken bara säsongen, och alla besökare delar samma post.
 */
export const getCachedPlayerList = cachedRead(
  "player-list-v2",
  async (params: PlayerListParams): Promise<PlayerListResult> => listPlayers(createAnonClient(), params),
  { tags: ["players"] }
);

/**
 * Startsidans "Flest mål {säsong}" för användarens favoritlag. Publik
 * ligadata — två användare med samma favoritlag ska inte kosta två
 * databasgenomgångar. Returnerar ett vanligt objekt (inte hela
 * getTopScorers-svaret) så att inget onödigt hamnar i cachen.
 */
export const getCachedTopScorer = cachedRead(
  "team-top-scorer-v2",
  async (teamName: string): Promise<{ name: string; goals: number; season: number | null } | null> => {
    const result = await getTopScorers(createAnonClient(), { team: teamName, limit: 1 });
    const top = result.scorers[0];
    return top ? { name: top.name, goals: top.goals, season: result.season ?? null } : null;
  },
  { tags: ["teams"] }
);

export interface SeasonFixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  events_synced_at: string | null;
  home_team_id: number;
  away_team_id: number;
  home: { name: string; logo_url: string | null } | null;
  away: { name: string; logo_url: string | null } | null;
}

export interface SeasonFixtureParams {
  seasonId: number;
  homeTeamId?: number;
  awayTeamId?: number;
  teamId?: number;
  status?: string;
}

/**
 * Matcharkivets lista. Flyttad hit från app/(app)/(content)/matcher/page.tsx
 * utan en enda ändrad filterregel — bara cachad, eftersom en säsongs
 * matchlista är exakt likadan för alla besökare mellan importkörningar.
 *
 * TTL:n är medvetet mycket kortare än standardens 5 minuter: listan visar
 * även pågående matchers status och ställning. Dagens matcher har dessutom
 * sin EGNA live-sektion överst (TodayMatches, som pollar oberoende av det
 * här) — 30s här påverkar alltså bara arkivlistans siffror, aldrig
 * live-flödet.
 */
export const getCachedSeasonFixtures = cachedRead(
  "season-fixtures-v1",
  async (params: SeasonFixtureParams): Promise<SeasonFixtureRow[]> => {
    const supabase = createAnonClient();
    let query = supabase
      .from("fixture")
      .select(
        "id, kickoff_at, status, round, home_score, away_score, events_synced_at, home_team_id, away_team_id, home:home_team_id(name, logo_url), away:away_team_id(name, logo_url)"
      )
      .eq("season_id", params.seasonId);

    if (params.homeTeamId) query = query.eq("home_team_id", params.homeTeamId);
    if (params.awayTeamId) query = query.eq("away_team_id", params.awayTeamId);
    if (params.teamId) query = query.or(`home_team_id.eq.${params.teamId},away_team_id.eq.${params.teamId}`);
    // Fas 20: "Senaste" filtrerade tidigare på exakt status = 'FT' och
    // missade därmed matcher avgjorda efter förlängning/straffar (AET/PEN),
    // medan "Kommande" var allt som INTE var FT — alltså även pågående och
    // inställda matcher. Båda utgår nu från samma fasindelning som resten
    // av produkten.
    if (params.status === "finished") query = query.in("status", ["FT", "AET", "PEN"]);
    else if (params.status === "upcoming") query = query.in("status", ["NS", "TBD"]);

    // "Senaste" (finished) är mest meningsfullt nyast-först — "Kommande"/
    // "Alla" som ett säsongsschema, kronologiskt (oförändrat sen tidigare).
    const { data } = await query
      .order("kickoff_at", { ascending: params.status !== "finished" })
      .returns<SeasonFixtureRow[]>();
    return data ?? [];
  },
  { ttlMs: 30_000, revalidate: 30, tags: ["fixtures"] }
);

/**
 * Scout-sökningen. Uppmätt 1,6–2,1s per anrop och kördes om vid VARJE
 * sidladdning — även när ingen sökt på något, eftersom sidan alltid kör en
 * tom sökning för att kunna visa utgångsläget.
 */
export const getCachedScoutSearch = cachedRead(
  "scout-search-v2",
  async (params: ScoutSearchParams): Promise<ScoutSearchResultRow[]> => searchScoutPlayers(createAnonClient(), params),
  { tags: ["players"] }
);
