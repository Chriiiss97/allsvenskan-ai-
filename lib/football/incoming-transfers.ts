import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { displayPlayerName } from "./player-name";
import { getLeagueTier, NON_COMPETITIVE_LEAGUE_IDS } from "./league-tier";
import { getLeagueStrength, type LeagueStrength } from "./post-allsvenskan-level";
import { countryKey } from "@/lib/i18n/sv";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 22 (2026-08-23) — "Värvningar till Allsvenskan": spegelbilden av
 * "Efter Allsvenskan" (post-allsvenskan.ts). Den frågar "vart tar spelarna
 * vägen och vilka lyckas?"; den här frågar "varifrån hämtar klubbarna
 * spelare, och vilka värvningar lyckas?".
 *
 * ── MÄTT INNAN DEN BYGGDES (användarkrav) ────────────────────────────────
 * Underlaget inventerades mot den riktiga databasen INNAN en rad UI skrevs.
 * Utfallet, steg för steg:
 *
 *   player_transfer_event totalt                              12 022 rader
 *   → med en av våra 33 Allsvenska klubbar som DESTINATION      4 382
 *   → varav avsändaren är en klubb utanför Allsvenskan          2 431
 *   → varav avsändarens LAND gick att verifiera, och är utländskt  1 304
 *   → varav spelaren FAKTISKT spelade allsvenskt för klubben     1 022
 *   → varav ankomsten skedde direkt (samma eller nästa säsong)      965
 *
 * 965 verifierade värvningar, 32 klubbar, 61 länder, 120 avsändarligor.
 * Fördelningen är rimlig och känns igen: Norge 249, Danmark 197,
 * Nederländerna 86, England 81, Finland 77 (räknat på steg 4).
 *
 * ── DEFINITIONEN, OCH VARFÖR DEN ÄR SÅ STRIKT ────────────────────────────
 * Uttryckligt användarkrav: en spelare får bara räknas om vi kan BEVISA en
 * direkt övergång utländsk klubb → allsvensk klubb. Inte "utländsk klubb →
 * Superettan → Allsvenskan", inte "råkar ha utlandsstatistik". Alla fyra
 * villkoren nedan måste därför hålla samtidigt:
 *
 *  1. DOKUMENTERAD ÖVERGÅNG. En rad i `player_transfer_event` (api-footballs
 *     /transfers) där destinationen är en av våra Allsvenska klubbar
 *     (`team.external_id`). Ingen härledning ur statistik — den faktiska
 *     övergångshändelsen ska finnas.
 *  2. VERIFIERAT UTLÄNDSK AVSÄNDARE. Avsändarklubbens land avgörs INTE av
 *     klubbnamnet utan av `player_career_stint`: i första hand spelarens
 *     EGEN säsong i den klubben (då vet vi exakt vilken liga hen kom ifrån),
 *     i andra hand klubbens vanligaste dokumenterade liga. Går landet inte
 *     att verifiera räknas övergången INTE — hellre färre rader än en
 *     påhittad ursprungsliga. Sverige exkluderas här, vilket samtidigt
 *     täcker "Superettan → Allsvenskan".
 *  3. SPELADE FAKTISKT. Spelaren har minst en `statistics`-rad (Allsvenskan,
 *     league_id=1) för DEN KLUBB som värvade hen, med `appearances > 0` och
 *     säsong ≥ övergångsåret. En värvning som aldrig blev en allsvensk match
 *     kan varken kallas lyckad eller misslyckad — den har inget utfall att
 *     mäta.
 *  4. DIREKT ANKOMST. Första allsvenska säsongen för klubben ska vara
 *     övergångsåret eller året efter ({@link MAX_ARRIVAL_DELAY_SEASONS}).
 *     Det är spärren mot "klubben spelade i Superettan när spelaren kom och
 *     gick upp tre år senare" — och mot api-footballs platshållardatum
 *     `1926-01-01` (fördröjning 96–98 år, se
 *     EARLIEST_PLAUSIBLE_TRANSFER_YEAR i post-allsvenskan.ts som redan
 *     dokumenterat samma fälla åt andra hållet).
 *
 * ── ÅTERVÄNDARE ──────────────────────────────────────────────────────────
 * 315 av de kvalificerade hade allsvenskt spel FÖRE övergången: svenskar som
 * kommer hem, eller utländska spelare som varit här tidigare. De är
 * fortfarande äkta inkommande utlandsvärvningar och räknas därför med — men
 * de MÄRKS (`isReturnee`) och går att filtrera bort i UI:t, så "vilka
 * nyförvärv utifrån lyckas bäst?" kan ställas utan att Viktor Claesson-typen
 * blandas in.
 *
 * ── PRESTANDA ────────────────────────────────────────────────────────────
 * Fem bulk-frågor + JS-aggregering (samma mönster som post-allsvenskan.ts),
 * alla parallella och sidnumrerade via fetchAllRows. Cachas av
 * cached-reads.ts — den här funktionen ska aldrig köras per besökare.
 */

/** Övergången ska ha lett till allsvenskt spel samma säsong eller nästa. */
export const MAX_ARRIVAL_DELAY_SEASONS = 1;

/**
 * Lägsta speltid för att komma med i takt-baserade rankningar (poäng/90,
 * snittbetyg). ~5 hela matcher — utan spärren toppas listan av en spelare
 * som gjorde mål på sina enda 12 inhoppsminuter.
 */
export const MIN_MINUTES_FOR_RATE = 450;

export interface IncomingSigning {
  playerId: number;
  playerName: string;
  photoUrl: string | null;
  /** Rå position från `player.position` ("Attacker"/"Midfielder"/...). */
  position: string | null;

  /** Den allsvenska klubb som värvade spelaren. */
  clubId: number;
  clubName: string;
  clubExternalId: number | null;
  clubLogoUrl: string | null;

  /** Klubben spelaren kom ifrån. */
  fromClubName: string;
  fromClubLogoUrl: string | null;
  /** Verifierat land (rått api-football-namn, översätts i UI:t). */
  fromCountry: string;
  fromLeagueName: string;
  fromLeagueExternalId: number;
  /** 1 = högsta divisionen, 2 = etablerad andradivision (league-tier.ts). */
  fromLeagueTier: 1 | 2 | null;
  /** Ligans styrka 1–5 (post-allsvenskan-level.ts), null för ligor utanför skalan. */
  fromLeagueStrength: LeagueStrength | null;
  /** Hur säkert avsändarligan är bestämd — visas aldrig som en siffra, men styr formuleringen. */
  sourceBasis: "player_stint" | "club_history";

  transferDate: string;
  transferYear: number;
  /** Rå sträng från api-football ("Free"/"Loan"/"€ 1.5M"/"N/A"). */
  transferType: string | null;

  /** Första allsvenska säsongen för den värvande klubben. */
  arrivalSeason: number;
  /** Senaste allsvenska säsongen för klubben (kan vara samma som ankomsten). */
  lastSeason: number;
  seasonsAtClub: number;
  /** Hade spelaren allsvenskt spel redan innan övergången? */
  isReturnee: boolean;

  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  /** mål + assist — "poäng" i UI:t. */
  points: number;
  /** null när speltiden är under MIN_MINUTES_FOR_RATE (för tunt underlag). */
  pointsPer90: number | null;
  /** Snittbetyg viktat på matcher, null om ingen säsong hade betyg. */
  avgRating: number | null;
}

interface TransferRow {
  player_id: number;
  transfer_date: string;
  from_team_name: string | null;
  from_team_external_id: number | null;
  from_team_logo_url: string | null;
  to_team_external_id: number | null;
  transfer_type: string | null;
}

interface StintRow {
  player_id: number;
  team_external_id: number | null;
  league_country: string | null;
  league_name: string | null;
  league_external_id: number;
  season_year: number;
}

interface StatRow {
  player_id: number;
  team_id: number;
  appearances: number;
  minutes_played: number;
  goals: number;
  assists: number;
  rating: number | null;
  season: { year: number } | null;
}

interface PlayerRow {
  id: number;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  position: string | null;
}

interface TeamRow {
  id: number;
  external_id: number | null;
  name: string;
  logo_url: string | null;
}

/** En stint-rad duger som ligabevis bara om den är en riktig, landsbunden division. */
function isDomesticLeagueRow(row: StintRow): boolean {
  if (NON_COMPETITIVE_LEAGUE_IDS.has(row.league_external_id)) return false;
  if (!row.league_country || row.league_country === "World") return false;
  return getLeagueTier(row.league_external_id) != null;
}

export async function getIncomingTransfers(supabase: Supabase): Promise<IncomingSigning[]> {
  const [transferRows, stintRows, statRows, playerRows, teamsResult] = await Promise.all([
    fetchAllRows<TransferRow>((from, to) =>
      supabase
        .from("player_transfer_event")
        .select("player_id, transfer_date, from_team_name, from_team_external_id, from_team_logo_url, to_team_external_id, transfer_type")
        .range(from, to)
        .returns<TransferRow[]>()
    ),
    fetchAllRows<StintRow>((from, to) =>
      supabase
        .from("player_career_stint")
        .select("player_id, team_external_id, league_country, league_name, league_external_id, season_year")
        .range(from, to)
        .returns<StintRow[]>()
    ),
    fetchAllRows<StatRow>((from, to) =>
      supabase
        .from("statistics")
        .select("player_id, team_id, appearances, minutes_played, goals, assists, rating, season:season_id(year)")
        .range(from, to)
        .returns<StatRow[]>()
    ),
    fetchAllRows<PlayerRow>((from, to) =>
      supabase.from("player").select("id, full_name, first_name, last_name, photo_url, position").range(from, to).returns<PlayerRow[]>()
    ),
    supabase.from("team").select("id, external_id, name, logo_url").not("external_id", "is", null).returns<TeamRow[]>(),
  ]);
  if (teamsResult.error) throw teamsResult.error;

  const playerById = new Map(playerRows.map((p) => [p.id, p]));
  const allsvenskanTeamByExternalId = new Map((teamsResult.data ?? []).map((t) => [t.external_id as number, t]));

  // ── Ligabevis per klubb ────────────────────────────────────────────────
  // Två uppslag: spelarens EGNA säsonger i klubben (exakt: vi vet vilken liga
  // just hen spelade i där) och klubbens samlade historik från ALLA spelare
  // (fallback när vi inte importerat spelarens egen stint i avsändarklubben).
  const stintsByPlayerAndTeam = new Map<string, StintRow[]>();
  const domesticStintsByTeam = new Map<number, StintRow[]>();
  for (const row of stintRows) {
    if (row.team_external_id == null) continue;
    const key = `${row.player_id}:${row.team_external_id}`;
    const own = stintsByPlayerAndTeam.get(key);
    if (own) own.push(row);
    else stintsByPlayerAndTeam.set(key, [row]);

    if (!isDomesticLeagueRow(row)) continue;
    const club = domesticStintsByTeam.get(row.team_external_id);
    if (club) club.push(row);
    else domesticStintsByTeam.set(row.team_external_id, [row]);
  }

  function resolveSourceLeague(playerId: number, teamExternalId: number, transferYear: number) {
    const own = (stintsByPlayerAndTeam.get(`${playerId}:${teamExternalId}`) ?? []).filter(isDomesticLeagueRow);
    if (own.length > 0) {
      // Klubbar byter division. Den säsong som ligger NÄRMAST övergången är
      // den spelaren faktiskt kom ifrån.
      const closest = own.reduce((best, row) =>
        Math.abs(row.season_year - transferYear) < Math.abs(best.season_year - transferYear) ? row : best
      );
      return { row: closest, basis: "player_stint" as const };
    }

    const clubRows = domesticStintsByTeam.get(teamExternalId) ?? [];
    if (clubRows.length === 0) return null;
    const countByLeague = new Map<number, { count: number; row: StintRow }>();
    for (const row of clubRows) {
      const entry = countByLeague.get(row.league_external_id);
      if (entry) entry.count++;
      else countByLeague.set(row.league_external_id, { count: 1, row });
    }
    const mostCommon = [...countByLeague.values()].sort((a, b) => b.count - a.count)[0];
    return { row: mostCommon.row, basis: "club_history" as const };
  }

  // ── Allsvenskt spel per spelare ────────────────────────────────────────
  const allsvenskanByPlayer = new Map<number, StatRow[]>();
  for (const row of statRows) {
    if (!row.season) continue;
    const list = allsvenskanByPlayer.get(row.player_id);
    if (list) list.push(row);
    else allsvenskanByPlayer.set(row.player_id, [row]);
  }

  const signings: IncomingSigning[] = [];
  // Samma spelare kan ha flera transferrader till samma klubb (t.ex. en
  // lånerad + en permanent). Den FÖRSTA ankomsten är värvningen.
  const seen = new Set<string>();

  for (const transfer of transferRows) {
    if (transfer.to_team_external_id == null) continue;
    const club = allsvenskanTeamByExternalId.get(transfer.to_team_external_id);
    if (!club) continue; // destinationen är inte en allsvensk klubb
    if (transfer.from_team_external_id == null) continue;
    if (allsvenskanTeamByExternalId.has(transfer.from_team_external_id)) continue; // intern allsvensk övergång

    const transferYear = Number(transfer.transfer_date.slice(0, 4));
    if (!Number.isFinite(transferYear)) continue;

    const source = resolveSourceLeague(transfer.player_id, transfer.from_team_external_id, transferYear);
    if (!source) continue; // kunde inte verifiera varifrån — räknas inte
    if (countryKey(source.row.league_country) === countryKey("Sweden")) continue; // svensk avsändare, inte en utlandsvärvning

    const clubSeasons = (allsvenskanByPlayer.get(transfer.player_id) ?? []).filter(
      (row) => row.team_id === club.id && row.appearances > 0 && (row.season?.year ?? 0) >= transferYear
    );
    if (clubSeasons.length === 0) continue; // spelade aldrig allsvenskt för klubben efter övergången

    const arrivalSeason = Math.min(...clubSeasons.map((row) => row.season!.year));
    if (arrivalSeason - transferYear > MAX_ARRIVAL_DELAY_SEASONS) continue; // ingen direkt ankomst

    const key = `${transfer.player_id}:${club.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const player = playerById.get(transfer.player_id);
    const appearances = clubSeasons.reduce((sum, row) => sum + (row.appearances ?? 0), 0);
    const minutesPlayed = clubSeasons.reduce((sum, row) => sum + (row.minutes_played ?? 0), 0);
    const goals = clubSeasons.reduce((sum, row) => sum + (row.goals ?? 0), 0);
    const assists = clubSeasons.reduce((sum, row) => sum + (row.assists ?? 0), 0);

    // Betyget viktas på matcher: en säsong med 25 matcher ska väga tyngre än
    // en med 3. Säsonger utan betyg hoppas över helt (aldrig 0 som gissning).
    const rated = clubSeasons.filter((row) => row.rating != null && (row.appearances ?? 0) > 0);
    const ratingWeight = rated.reduce((sum, row) => sum + row.appearances, 0);
    const avgRating = ratingWeight > 0 ? rated.reduce((sum, row) => sum + Number(row.rating) * row.appearances, 0) / ratingWeight : null;

    const seasonYears = clubSeasons.map((row) => row.season!.year);
    const isReturnee = (allsvenskanByPlayer.get(transfer.player_id) ?? []).some(
      (row) => row.appearances > 0 && (row.season?.year ?? 0) < transferYear
    );

    signings.push({
      playerId: transfer.player_id,
      playerName: player ? displayPlayerName(player.first_name, player.last_name, player.full_name) : `Spelare ${transfer.player_id}`,
      photoUrl: player?.photo_url ?? null,
      position: player?.position ?? null,

      clubId: club.id,
      clubName: club.name,
      clubExternalId: club.external_id,
      clubLogoUrl: club.logo_url,

      fromClubName: transfer.from_team_name ?? "Okänd klubb",
      fromClubLogoUrl: transfer.from_team_logo_url,
      fromCountry: source.row.league_country!,
      fromLeagueName: source.row.league_name ?? "Okänd liga",
      fromLeagueExternalId: source.row.league_external_id,
      fromLeagueTier: getLeagueTier(source.row.league_external_id),
      fromLeagueStrength: getLeagueStrength(source.row.league_external_id),
      sourceBasis: source.basis,

      transferDate: transfer.transfer_date,
      transferYear,
      transferType: transfer.transfer_type,

      arrivalSeason,
      lastSeason: Math.max(...seasonYears),
      seasonsAtClub: new Set(seasonYears).size,
      isReturnee,

      appearances,
      minutesPlayed,
      goals,
      assists,
      points: goals + assists,
      pointsPer90: minutesPlayed >= MIN_MINUTES_FOR_RATE ? ((goals + assists) * 90) / minutesPlayed : null,
      avgRating,
    });
  }

  return signings.sort((a, b) => b.points - a.points || b.minutesPlayed - a.minutesPlayed);
}

// ---------------------------------------------------------------------------
// Aggregeringar — alla rena funktioner över resultatet ovan, aldrig egna
// DB-frågor (samma uppdelning som post-allsvenskan.ts: EN hämtning, många
// vyer).
// ---------------------------------------------------------------------------

export interface IncomingGroup {
  /** Stabil nyckel för länkar/urval (klubbnamn, landsnyckel eller liga-id). */
  key: string;
  label: string;
  logoUrl: string | null;
  /** Bara satt för ligagrupper — landet ligan spelas i. */
  country: string | null;
  signings: number;
  players: number;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  /** Poäng per 90 över gruppens SAMLADE speltid — null under MIN_MINUTES_FOR_RATE. */
  pointsPer90: number | null;
  /** Matchviktat snittbetyg, null om ingen värvning i gruppen har betyg. */
  avgRating: number | null;
  /** Värvningen med flest poäng — gruppens ansikte utåt. */
  best: IncomingSigning | null;
}

function buildGroup(key: string, label: string, logoUrl: string | null, country: string | null, rows: IncomingSigning[]): IncomingGroup {
  const minutesPlayed = rows.reduce((sum, r) => sum + r.minutesPlayed, 0);
  const goals = rows.reduce((sum, r) => sum + r.goals, 0);
  const assists = rows.reduce((sum, r) => sum + r.assists, 0);
  const rated = rows.filter((r) => r.avgRating != null && r.appearances > 0);
  const ratingWeight = rated.reduce((sum, r) => sum + r.appearances, 0);
  return {
    key,
    label,
    logoUrl,
    country,
    signings: rows.length,
    players: new Set(rows.map((r) => r.playerId)).size,
    appearances: rows.reduce((sum, r) => sum + r.appearances, 0),
    minutesPlayed,
    goals,
    assists,
    points: goals + assists,
    pointsPer90: minutesPlayed >= MIN_MINUTES_FOR_RATE ? ((goals + assists) * 90) / minutesPlayed : null,
    avgRating: ratingWeight > 0 ? rated.reduce((sum, r) => sum + r.avgRating! * r.appearances, 0) / ratingWeight : null,
    best: rows.reduce<IncomingSigning | null>((best, r) => (!best || r.points > best.points ? r : best), null),
  };
}

function groupBy(signings: IncomingSigning[], keyOf: (s: IncomingSigning) => string | null): Map<string, IncomingSigning[]> {
  const groups = new Map<string, IncomingSigning[]>();
  for (const signing of signings) {
    const key = keyOf(signing);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(signing);
    else groups.set(key, [signing]);
  }
  return groups;
}

/** Vilka allsvenska klubbar värvar mest — och bäst — från utlandet? */
export function aggregateByClub(signings: IncomingSigning[]): IncomingGroup[] {
  return [...groupBy(signings, (s) => String(s.clubId)).entries()]
    .map(([key, rows]) => buildGroup(key, rows[0].clubName, rows[0].clubLogoUrl, null, rows))
    .sort((a, b) => b.points - a.points || b.signings - a.signings);
}

/** Varifrån hittar Allsvenskan sina bästa värvningar — per land. */
export function aggregateByCountry(signings: IncomingSigning[]): IncomingGroup[] {
  return [...groupBy(signings, (s) => countryKey(s.fromCountry)).entries()]
    .map(([key, rows]) => buildGroup(key, rows[0].fromCountry, null, rows[0].fromCountry, rows))
    .sort((a, b) => b.signings - a.signings || b.points - a.points);
}

/** ...och per avsändarliga, den mest scoutbara nivån av samma fråga. */
export function aggregateByLeague(signings: IncomingSigning[]): IncomingGroup[] {
  return [...groupBy(signings, (s) => String(s.fromLeagueExternalId)).entries()]
    .map(([key, rows]) => buildGroup(key, rows[0].fromLeagueName, null, rows[0].fromCountry, rows))
    .sort((a, b) => b.signings - a.signings || b.points - a.points);
}

export interface IncomingInsights {
  totalSignings: number;
  totalPlayers: number;
  totalClubs: number;
  totalCountries: number;
  totalLeagues: number;
  totalGoals: number;
  totalAssists: number;
  totalAppearances: number;
  totalMinutes: number;
  returnees: number;
  newcomers: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Flest värvningar per år — visar när utlandsvärvandet tog fart. */
  byYear: { year: number; signings: number }[];
  topCountry: IncomingGroup | null;
  topLeague: IncomingGroup | null;
  topClub: IncomingGroup | null;
  /** Bästa avsändarliga på poäng/90 bland ligor med minst {@link MIN_LEAGUE_SIGNINGS} värvningar. */
  mostEffectiveLeague: IncomingGroup | null;
  bestSigning: IncomingSigning | null;
}

/**
 * En liga behöver ett minsta antal värvningar för att "poäng per 90" ska
 * betyda något — annars vinner alltid en liga med EN enda anfallare som
 * råkade göra mål.
 */
export const MIN_LEAGUE_SIGNINGS = 8;

export function computeIncomingInsights(signings: IncomingSigning[]): IncomingInsights {
  const countries = aggregateByCountry(signings);
  const leagues = aggregateByLeague(signings);
  const clubs = aggregateByClub(signings);

  const yearCounts = new Map<number, number>();
  for (const s of signings) yearCounts.set(s.transferYear, (yearCounts.get(s.transferYear) ?? 0) + 1);
  const years = [...yearCounts.keys()].sort((a, b) => a - b);

  const effective = leagues
    .filter((l) => l.signings >= MIN_LEAGUE_SIGNINGS && l.pointsPer90 != null)
    .sort((a, b) => b.pointsPer90! - a.pointsPer90!);

  return {
    totalSignings: signings.length,
    totalPlayers: new Set(signings.map((s) => s.playerId)).size,
    totalClubs: clubs.length,
    totalCountries: countries.length,
    totalLeagues: leagues.length,
    totalGoals: signings.reduce((sum, s) => sum + s.goals, 0),
    totalAssists: signings.reduce((sum, s) => sum + s.assists, 0),
    totalAppearances: signings.reduce((sum, s) => sum + s.appearances, 0),
    totalMinutes: signings.reduce((sum, s) => sum + s.minutesPlayed, 0),
    returnees: signings.filter((s) => s.isReturnee).length,
    newcomers: signings.filter((s) => !s.isReturnee).length,
    firstYear: years[0] ?? null,
    lastYear: years[years.length - 1] ?? null,
    byYear: years.map((year) => ({ year, signings: yearCounts.get(year)! })),
    topCountry: countries[0] ?? null,
    topLeague: leagues[0] ?? null,
    topClub: clubs.reduce<IncomingGroup | null>((best, c) => (!best || c.signings > best.signings ? c : best), null),
    mostEffectiveLeague: effective[0] ?? null,
    bestSigning: signings.reduce<IncomingSigning | null>((best, s) => (!best || s.points > best.points ? s : best), null),
  };
}
