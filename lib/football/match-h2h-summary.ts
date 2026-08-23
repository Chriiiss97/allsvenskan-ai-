import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MatchFact } from "./match-preview";
import { asCountPct, asAvg } from "./match-preview-sv";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 16b (2026-08-22) — ett kompakt, visuellt H2H-sammandrag istället för
 * 6 separata punktrader (vinst/förlust/oavgjort × två lag). `buildH2HSummary`
 * bygger UTESLUTANDE på tal som redan finns i preview.headToHead:s `data`-fält
 * (samma källa som match-preview-sv.ts:s meningar) — aldrig omräknat bortom
 * enkel addition av tre redan exakta heltal (homeWins+awayWins+draws), aldrig
 * gissat.
 *
 * Fas 17 (2026-08-22) — `buildRealH2HSummary` nedan är en andra, oberoende
 * väg till SAMMA H2HSummary-form: räknad direkt från vår egen fixture-tabell
 * istället för Sportmonks facts. Se dess egen kommentar för varför den behövs.
 */

function findFact(facts: MatchFact[], typeIds: number[], participant: "home" | "away"): MatchFact | null {
  return facts.find((f) => typeIds.includes(f.sportmonksTypeId) && f.participant === participant) ?? null;
}

export interface H2HSummary {
  windowLabel: string;
  totalMatches: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  /** Hemmalagets vinster NÄR DE SPELAT HEMMA i den här inbördesserien — samma data.home-fält som redan fanns, aldrig uträknat. */
  homeWinsAtHome: number | null;
  homeGoalsPerMatch: number | null;
  awayGoalsPerMatch: number | null;
}

export function buildH2HSummary(facts: MatchFact[]): H2HSummary | null {
  let homeWinsFact = findFact(facts, [76088], "home");
  let awayWinsFact = findFact(facts, [76088], "away");
  let drawsFact = findFact(facts, [76105], "home") ?? findFact(facts, [76105], "away");
  let windowLabel = "Alla möten";

  if (!homeWinsFact || !awayWinsFact || !drawsFact) {
    homeWinsFact = findFact(facts, [87860], "home");
    awayWinsFact = findFact(facts, [87860], "away");
    drawsFact = findFact(facts, [87861], "home") ?? findFact(facts, [87861], "away");
    windowLabel = "Senaste 5 mötena";
  }

  const homeWins = homeWinsFact ? asCountPct(homeWinsFact.data) : null;
  const awayWins = awayWinsFact ? asCountPct(awayWinsFact.data) : null;
  const draws = drawsFact ? asCountPct(drawsFact.data) : null;
  if (!homeWins || !awayWins || !draws) return null;

  const homeGoalsFact = findFact(facts, [76106], "home") ?? findFact(facts, [87864], "home");
  const awayGoalsFact = findFact(facts, [76106], "away") ?? findFact(facts, [87864], "away");

  return {
    windowLabel,
    totalMatches: homeWins.count + awayWins.count + draws.count,
    homeWins: homeWins.count,
    awayWins: awayWins.count,
    draws: draws.count,
    homeWinsAtHome: homeWins.home,
    homeGoalsPerMatch: homeGoalsFact ? (asAvg(homeGoalsFact.data)?.average ?? null) : null,
    awayGoalsPerMatch: awayGoalsFact ? (asAvg(awayGoalsFact.data)?.average ?? null) : null,
  };
}

interface RealH2HFixtureRow {
  status: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
}

/**
 * Fallback-H2H när Sportmonks fixture_match_facts saknas — vilket den ALLTID
 * gör för en kommande (NS) match, eftersom sportmonks-import-match-facts.ts
 * bara hämtar för redan avslutade matcher (status FT/AET/PEN), och aldrig
 * körs på schema (inget cron-jobb anropar den). Räknar samma H2HSummary-form
 * direkt från vår egen `fixture`-tabell — riktiga, redan importerade resultat
 * över alla säsonger, samma "aldrig gissa"-princip som computeFormRecord
 * (tools.ts). Bara avslutade möten (status FT/AET/PEN) med båda målen satta
 * räknas. Returnerar null om lagen aldrig mötts i vår data — ALDRIG en
 * påhittad "0 möten"-rad, sektionen ska då bara utelämnas av anroparen.
 */
export async function buildRealH2HSummary(supabase: Supabase, homeTeamId: number, awayTeamId: number): Promise<H2HSummary | null> {
  const { data, error } = await supabase
    .from("fixture")
    .select("status, home_team_id, away_team_id, home_score, away_score")
    .or(`and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`)
    .in("status", ["FT", "AET", "PEN"])
    .returns<RealH2HFixtureRow[]>();
  if (error) throw error;

  const meetings = (data ?? []).filter((f) => f.home_score !== null && f.away_score !== null);
  if (meetings.length === 0) return null;

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let homeWinsAtHome = 0;
  let homeGoals = 0;
  let awayGoals = 0;

  for (const m of meetings) {
    const homeTeamWasHome = m.home_team_id === homeTeamId;
    const homeTeamGoals = (homeTeamWasHome ? m.home_score : m.away_score) as number;
    const awayTeamGoals = (homeTeamWasHome ? m.away_score : m.home_score) as number;
    homeGoals += homeTeamGoals;
    awayGoals += awayTeamGoals;
    if (homeTeamGoals > awayTeamGoals) {
      homeWins += 1;
      if (homeTeamWasHome) homeWinsAtHome += 1;
    } else if (awayTeamGoals > homeTeamGoals) {
      awayWins += 1;
    } else {
      draws += 1;
    }
  }

  return {
    // Fas 21: hette "Alla möten", vilket var missvisande — vår fixture-
    // tabell börjar 2016, så aggregatet är alla möten VI HAR, inte alla som
    // spelats. (Kontroll mot FotMob 2026-08-23: de visar 34 möten för
    // IFK–Elfsborg, vi 21. Våra 21 stämmer exakt, urvalet är bara kortare.)
    windowLabel: "Möten i vår data",
    totalMatches: meetings.length,
    homeWins,
    awayWins,
    draws,
    homeWinsAtHome,
    homeGoalsPerMatch: homeGoals / meetings.length,
    awayGoalsPerMatch: awayGoals / meetings.length,
  };
}

/**
 * Fas 21 (2026-08-23) — de faktiska mötena, inte bara aggregatet.
 *
 * "Mot varandra"-fliken visade tidigare enbart en sammanfattning ("7 vinster
 * / 13 oavgjorda / 14 vinster"). Det en läsare faktiskt vill se är
 * matcherna: datum, ställning, vem som spelade hemma. Datan har alltid
 * funnits i vår egen fixture-tabell — den lästes bara aldrig ut.
 *
 * Samma avgränsning som buildRealH2HSummary: bara avslutade möten med båda
 * målen satta räknas, aldrig en halvimporterad rad. Nyast först, eftersom
 * det senaste mötet är det mest relevanta.
 */
export interface HeadToHeadMeeting {
  fixtureId: number;
  kickoff: string;
  season: number | null;
  round: string | null;
  status: string;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export async function getHeadToHeadMeetings(
  supabase: Supabase,
  homeTeamId: number,
  awayTeamId: number,
  limit = 10
): Promise<HeadToHeadMeeting[]> {
  const { data, error } = await supabase
    .from("fixture")
    .select(
      "id, kickoff_at, status, round, home_score, away_score, home:home_team_id(name), away:away_team_id(name), season:season_id(year)"
    )
    .or(`and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: false })
    .limit(limit)
    .returns<
      {
        id: number;
        kickoff_at: string;
        status: string;
        round: string | null;
        home_score: number | null;
        away_score: number | null;
        home: { name: string } | null;
        away: { name: string } | null;
        season: { year: number } | null;
      }[]
    >();
  if (error) throw error;

  return (data ?? [])
    .filter((f) => f.home_score !== null && f.away_score !== null)
    .map((f) => ({
      fixtureId: f.id,
      kickoff: f.kickoff_at,
      season: f.season?.year ?? null,
      round: f.round,
      status: f.status,
      homeName: f.home?.name ?? null,
      awayName: f.away?.name ?? null,
      homeScore: f.home_score,
      awayScore: f.away_score,
    }));
}
