import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { normalizeTeamName } from "./team-name-normalize";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Fas 15 (Complete Scout Player Card) — Allsvensk karriärtidslinje
 * ============================================================================
 * Grupperar spelarens redan hämtade `statistics`-rader (samma rader
 * getPlayerProfile redan läser) till en tidslinje, nyaste säsong först.
 *
 * VIKTIGT (se undersökningen tidigare i den här konversationen — "hur
 * hanterar vi spelare som spelat utomlands?"): det här är UTESLUTANDE
 * Allsvensk historik. Verifierat mot databasen: `league`-tabellen har bara
 * 1 rad (Allsvenskan), `api_raw_response` (tänkt RAW-arkiv) har 0 rader —
 * ingen utländsk klubbhistorik finns lagrad någonstans i systemet. UI:t
 * (CareerTimeline.tsx) måste alltid visa en explicit disclaimer om detta —
 * ALDRIG låtsas ha eller gissa på utländska säsonger/klubbar.
 *
 * Samma `hasPlayedSeason`-filter som resten av produkten (appearances > 0)
 * — en spelare som var registrerad men aldrig spelade en match för klubben
 * en säsong ska inte synas som en "karriärpost".
 */

export interface CareerTimelineEntry {
  seasonYear: number;
  teamId: number;
  teamExternalId: number | null;
  teamName: string;
  teamLogoUrl: string | null;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
}

interface StatisticsRow {
  appearances: number;
  minutes_played: number;
  goals: number;
  assists: number;
  team: { id: number; external_id: number | null; name: string; logo_url: string | null } | null;
  season: { year: number } | null;
}

/**
 * Fas 17 (2026-08-22) — spelarens karriär UTANFÖR Allsvenskan (utländska
 * ligor, lägre svenska divisioner, cupspel), byggd av
 * scripts/import/import-player-career.ts från riktiga api-football-anrop
 * (/transfers + /players?id&team&season — bekräftat i denna sessions
 * research, se migrationens filhuvud). Läser `player_career_stint`, som
 * ALDRIG innehåller Allsvenskan-ligan (den täcks redan av
 * getCareerTimeline ovan) — de två listorna kan alltså slås ihop utan
 * dubbletter.
 *
 * En spelare utan career_synced_at ännu (importen inte kört för hen än)
 * ger bara en tom lista här — INTE ett fel, INTE en påhittad rad. UI:t
 * (se CareerTimelineSection.tsx) visar det ärligt som "inte utredd än"
 * snarare än att påstå spelaren aldrig spelat utomlands.
 */
export interface ForeignCareerStint {
  teamName: string;
  teamLogoUrl: string | null;
  teamExternalId: number | null;
  leagueName: string;
  leagueCountry: string | null;
  leagueLogoUrl: string | null;
  seasonYear: number;
  appearances: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  rating: number | null;
}

interface CareerStintRow {
  team_name: string;
  team_logo_url: string | null;
  team_external_id: number | null;
  league_name: string;
  league_country: string | null;
  league_logo_url: string | null;
  season_year: number;
  appearances: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  rating: number | null;
}

export async function getForeignCareerStints(supabase: Supabase, params: { playerId: number }): Promise<ForeignCareerStint[]> {
  // Felresistent (samma skäl som tools.ts:s getPlayerProfile): migration
  // 20260822140000 kan vara okörd än — en saknad tabell ska ge en tom
  // lista, inte krascha hela spelarprofilen.
  const [stintResult, domesticEntries] = await Promise.all([
    supabase
      .from("player_career_stint")
      .select(
        "team_name, team_logo_url, team_external_id, league_name, league_country, league_logo_url, season_year, appearances, minutes_played, goals, assists, yellow_cards, red_cards, rating"
      )
      .eq("player_id", params.playerId)
      .order("season_year", { ascending: false })
      .returns<CareerStintRow[]>(),
    getCareerTimeline(supabase, params),
  ]);
  if (stintResult.error) return [];

  // Fas 18d (verifierat verkligt fall: J. Bager) — en Svenska Cupen-rad
  // för SAMMA klubb som redan finns i den Allsvenska historiken (bara
  // stavad utan diakritiska tecken, "IFK Goteborg" vs "IFK Göteborg") ska
  // INTE räknas som "utländsk karriär" — den är fortfarande samma klubb,
  // bara en annan tävling. Filtreras bort HÄR, vid källan, så varje
  // konsument (Karriärresan, Klubb/Säsong-fliken, "Om spelaren") automatiskt
  // får en redan korrekt lista utan att duplicera samma logik själva.
  const allsvenskaClubNames = new Set(domesticEntries.map((e) => normalizeTeamName(e.teamName)));

  // Fas 18h (2026-08-23, VERIFIERAT verkligt fall: F. Bohman/"Olympic") —
  // klubbnamn-jämförelsen ovan räckte INTE: en spelare som gått till en
  // ANNAN svensk klubb (Superettan/Ettan, t.ex. Trelleborg/Olympic) matchar
  // inte spelarens egna Allsvenska klubbnamn och slank alltså igenom som
  // "utländsk karriär" trots att `league_country` redan är "Sweden" i
  // databasen. "Lämnat Allsvenskan" (uttryckligt användarkrav) ska ENDAST
  // gälla en flytt till en klubb i ett ANNAT LAND — inte en flytt inom
  // Sverige. Filtreras på `league_country`, inte klubbnamn.
  return (stintResult.data ?? [])
    .filter((r) => !allsvenskaClubNames.has(normalizeTeamName(r.team_name)))
    .filter((r) => (r.league_country ?? "").trim().toLowerCase() !== "sweden")
    .map((r) => ({
      teamName: r.team_name,
      teamLogoUrl: r.team_logo_url,
      teamExternalId: r.team_external_id,
      leagueName: r.league_name,
      leagueCountry: r.league_country,
      leagueLogoUrl: r.league_logo_url,
      seasonYear: r.season_year,
      appearances: r.appearances,
      minutesPlayed: r.minutes_played,
      goals: r.goals,
      assists: r.assists,
      yellowCards: r.yellow_cards,
      redCards: r.red_cards,
      rating: r.rating,
    }));
}

export async function getCareerTimeline(supabase: Supabase, params: { playerId: number }): Promise<CareerTimelineEntry[]> {
  const { data, error } = await supabase
    .from("statistics")
    .select("appearances, minutes_played, goals, assists, team:team_id(id, external_id, name, logo_url), season:season_id(year)")
    .eq("player_id", params.playerId)
    .returns<StatisticsRow[]>();
  if (error) throw error;

  return (data ?? [])
    .filter((r) => hasPlayedSeason(r.appearances) && r.team !== null && r.season !== null)
    .map((r) => ({
      seasonYear: r.season!.year,
      teamId: r.team!.id,
      teamExternalId: r.team!.external_id,
      teamName: r.team!.name,
      teamLogoUrl: r.team!.logo_url,
      appearances: r.appearances,
      minutesPlayed: r.minutes_played,
      goals: r.goals,
      assists: r.assists,
    }))
    .sort((a, b) => b.seasonYear - a.seasonYear || a.teamName.localeCompare(b.teamName));
}
