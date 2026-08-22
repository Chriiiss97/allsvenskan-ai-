import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { listTeams, type TeamOption } from "./catalog";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 17 (2026-08-22) — flikarna på /tabell (Alla/Hemma/Borta/Senaste 5
 * matcherna/xG), efter en referensbild (FotMob) från användaren. Samma
 * princip som resten av projektet: ALDRIG en påhittad modell. Fyra av fem
 * vyer (alla/hemma/borta/senaste5) är EXAKT samma sorts tabell som "Alla" —
 * bara räknad på ett annat urval av redan spelade, riktiga matcher. Den
 * femte (xG) byter ut mål-för/mål-emot mot lagets egna, redan importerade
 * expected_goals-tal (fixture_team_stats, steg 4) — riktiga observerade
 * tal, INGEN egen xG-baserad poängmodell (det hade varit en påhittad,
 * overifierad modell, se PROJEKT_BRIEF).
 *
 * Zon-färgläggningen (Champions League-kval/Kval till Conference League/
 * Kvalmatch/Degradering) följer exakt den struktur användaren visade i sin
 * referensbild (1 CL-kval, plats 2–3 Conference League-kval, plats 14
 * kvalmatch, plats 15–16 degradering) — se ZONE_BY_RANK i /tabell/page.tsx.
 * Det är INTE en egen gissning, utan användarens egen källa.
 */

export type StandingsFilter = "alla" | "hemma" | "borta" | "senaste5" | "xg";

export interface NextOpponent {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface StandingsViewRow {
  team: TeamOption;
  rank: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  /** Mål (för/emot/diff) på "alla"/"hemma"/"borta"/"senaste5" — xG (för/emot/diff) på "xg", se `isXg`. */
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: Array<"W" | "D" | "L"> | null;
  nextOpponent: NextOpponent | null;
}

function fmtXg(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function rankRows(rows: Omit<StandingsViewRow, "rank">[]): StandingsViewRow[] {
  return [...rows]
    .sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

interface NextFixtureRow {
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
}

/** Nästa NS-match per lag, hämtat i EN fråga (inte 16) — se filhuvudet i tools.ts:s getNextFixture för per-lag-varianten det här ersätter på tabellsidan. */
async function getNextOpponentsBySeasonId(supabase: Supabase, seasonId: number, teamById: Map<number, TeamOption>): Promise<Map<number, NextOpponent>> {
  const { data, error } = await supabase
    .from("fixture")
    .select("kickoff_at, home_team_id, away_team_id")
    .eq("season_id", seasonId)
    .eq("status", "NS")
    .order("kickoff_at", { ascending: true })
    .returns<NextFixtureRow[]>();
  if (error) throw error;

  const next = new Map<number, NextOpponent>();
  for (const f of data ?? []) {
    for (const [teamId, oppId] of [
      [f.home_team_id, f.away_team_id],
      [f.away_team_id, f.home_team_id],
    ] as const) {
      if (next.has(teamId)) continue;
      const opp = teamById.get(oppId);
      if (opp) next.set(teamId, { id: opp.id, name: opp.name, logoUrl: opp.logoUrl });
    }
  }
  return next;
}

interface StandingsRawRow {
  team_id: number;
  rank: number;
  points: number;
  win: number;
  draw: number;
  lose: number;
  goals_for: number;
  goals_against: number;
  goals_diff: number;
  form: string | null;
  home_played: number | null;
  home_win: number | null;
  home_draw: number | null;
  home_lose: number | null;
  home_goals_for: number | null;
  home_goals_against: number | null;
  away_played: number | null;
  away_win: number | null;
  away_draw: number | null;
  away_lose: number | null;
  away_goals_for: number | null;
  away_goals_against: number | null;
  captured_at: string;
}

async function getLatestStandingsRows(supabase: Supabase, seasonId: number): Promise<Map<number, StandingsRawRow>> {
  const { data, error } = await supabase
    .from("standings")
    .select(
      "team_id, rank, points, win, draw, lose, goals_for, goals_against, goals_diff, form, " +
        "home_played, home_win, home_draw, home_lose, home_goals_for, home_goals_against, " +
        "away_played, away_win, away_draw, away_lose, away_goals_for, away_goals_against, captured_at"
    )
    .eq("season_id", seasonId)
    .order("captured_at", { ascending: false })
    .returns<StandingsRawRow[]>();
  if (error) throw error;

  // standings är append-only (ny rad varje hämtning) — dedupa till senaste
  // captured_at per lag, samma princip som catalog.ts:s getStandingsTable.
  const latestByTeam = new Map<number, StandingsRawRow>();
  for (const row of data ?? []) {
    if (!latestByTeam.has(row.team_id)) latestByTeam.set(row.team_id, row);
  }
  return latestByTeam;
}

function formToArray(form: string | null): Array<"W" | "D" | "L"> | null {
  if (!form) return null;
  const chars = form.split("").filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L");
  return chars.length > 0 ? chars.slice(-5) : null;
}

interface FtFixtureRow {
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
}

/** Alla avslutade matcher en säsong, EN fråga — grunden för "senaste 5 matcherna"-vyn (räknas i JS per lag, inte 16 separata frågor). */
async function getSeasonFtFixtures(supabase: Supabase, seasonId: number): Promise<FtFixtureRow[]> {
  const { data, error } = await supabase
    .from("fixture")
    .select("kickoff_at, home_team_id, away_team_id, home_score, away_score")
    .eq("season_id", seasonId)
    .eq("status", "FT")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("kickoff_at", { ascending: true })
    .returns<FtFixtureRow[]>();
  if (error) throw error;
  return data ?? [];
}

interface TeamStatsExpectedGoalsRow {
  fixture_id: number;
  team_id: number;
  expected_goals: number | null;
}

/**
 * Real xG-för/xG-emot per lag, summerat över säsongens avslutade matcher —
 * INGEN egen poängmodell, bara addition av redan importerade, riktiga
 * expected_goals-tal (fixture_team_stats). Lag utan xG-täckning för
 * matchen exkluderas ur den summan (aldrig 0 som gissning).
 */
async function getSeasonXgByTeam(supabase: Supabase, seasonId: number): Promise<Map<number, { xgFor: number; xgAgainst: number; matches: number }>> {
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select("id, home_team_id, away_team_id")
    .eq("season_id", seasonId)
    .eq("status", "FT")
    .returns<{ id: number; home_team_id: number; away_team_id: number }[]>();
  if (fixtureError) throw fixtureError;
  if (!fixtures || fixtures.length === 0) return new Map();

  const fixtureIds = fixtures.map((f) => f.id);
  const opponentByFixtureAndTeam = new Map<string, number>();
  for (const f of fixtures) {
    opponentByFixtureAndTeam.set(`${f.id}:${f.home_team_id}`, f.away_team_id);
    opponentByFixtureAndTeam.set(`${f.id}:${f.away_team_id}`, f.home_team_id);
  }

  const { data: statsRows, error: statsError } = await supabase
    .from("fixture_team_stats")
    .select("fixture_id, team_id, expected_goals")
    .in("fixture_id", fixtureIds)
    .returns<TeamStatsExpectedGoalsRow[]>();
  if (statsError) throw statsError;

  const xgByFixtureAndTeam = new Map<string, number>();
  for (const row of statsRows ?? []) {
    if (row.expected_goals == null) continue;
    xgByFixtureAndTeam.set(`${row.fixture_id}:${row.team_id}`, row.expected_goals);
  }

  const totals = new Map<number, { xgFor: number; xgAgainst: number; matches: number }>();
  for (const f of fixtures) {
    for (const teamId of [f.home_team_id, f.away_team_id]) {
      const oppId = opponentByFixtureAndTeam.get(`${f.id}:${teamId}`);
      const ownXg = xgByFixtureAndTeam.get(`${f.id}:${teamId}`);
      const oppXg = oppId != null ? xgByFixtureAndTeam.get(`${f.id}:${oppId}`) : undefined;
      if (ownXg == null || oppXg == null) continue; // ofullständig xG-data för matchen — räkna inte med den
      const entry = totals.get(teamId) ?? { xgFor: 0, xgAgainst: 0, matches: 0 };
      entry.xgFor += ownXg;
      entry.xgAgainst += oppXg;
      entry.matches += 1;
      totals.set(teamId, entry);
    }
  }
  return totals;
}

export async function getStandingsView(supabase: Supabase, params: { season: number; filter: StandingsFilter }): Promise<StandingsViewRow[]> {
  const teams = await listTeams(supabase);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).maybeSingle();
  if (!seasonRow) return [];
  const seasonId = seasonRow.id;

  const [standingsByTeam, nextOpponents] = await Promise.all([getLatestStandingsRows(supabase, seasonId), getNextOpponentsBySeasonId(supabase, seasonId, teamById)]);

  if (params.filter === "alla") {
    const rows: Omit<StandingsViewRow, "rank">[] = [];
    for (const s of standingsByTeam.values()) {
      const team = teamById.get(s.team_id);
      if (!team) continue;
      rows.push({
        team,
        played: s.win + s.draw + s.lose,
        win: s.win,
        draw: s.draw,
        lose: s.lose,
        goalsFor: s.goals_for,
        goalsAgainst: s.goals_against,
        goalsDiff: s.goals_diff,
        points: s.points,
        form: formToArray(s.form),
        nextOpponent: nextOpponents.get(s.team_id) ?? null,
      });
    }
    // "Alla" följer standings-tabellens EGEN rank (facit, samma som /lag
    // redan visar) — inte omräknad, till skillnad från de andra flikarna.
    return rows
      .sort((a, b) => (standingsByTeam.get(a.team.id)?.rank ?? 0) - (standingsByTeam.get(b.team.id)?.rank ?? 0))
      .map((r, i) => ({ ...r, rank: standingsByTeam.get(r.team.id)?.rank ?? i + 1 }));
  }

  if (params.filter === "hemma" || params.filter === "borta") {
    const isHome = params.filter === "hemma";
    const rows: Omit<StandingsViewRow, "rank">[] = [];
    for (const s of standingsByTeam.values()) {
      const team = teamById.get(s.team_id);
      if (!team) continue;
      const played = (isHome ? s.home_played : s.away_played) ?? 0;
      if (played === 0) continue; // inga hemma-/bortamatcher spelade — utelämnas, aldrig en påhittad 0-rad
      const win = (isHome ? s.home_win : s.away_win) ?? 0;
      const draw = (isHome ? s.home_draw : s.away_draw) ?? 0;
      const lose = (isHome ? s.home_lose : s.away_lose) ?? 0;
      const goalsFor = (isHome ? s.home_goals_for : s.away_goals_for) ?? 0;
      const goalsAgainst = (isHome ? s.home_goals_against : s.away_goals_against) ?? 0;
      rows.push({
        team,
        played,
        win,
        draw,
        lose,
        goalsFor,
        goalsAgainst,
        goalsDiff: goalsFor - goalsAgainst,
        points: win * 3 + draw,
        // Formsviten (standings.form) är säsongens övergripande senaste 5,
        // inte hemma-/bortaspecifik — real data, men samma sekvens som på
        // "Alla" snarare än en ny, separat beräkning. Dokumenterat här
        // hellre än att tyst påstå en venue-specifik form vi inte har.
        form: formToArray(s.form),
        nextOpponent: nextOpponents.get(s.team_id) ?? null,
      });
    }
    return rankRows(rows);
  }

  if (params.filter === "senaste5") {
    const fixtures = await getSeasonFtFixtures(supabase, seasonId);
    const rows: Omit<StandingsViewRow, "rank">[] = [];
    for (const team of teams) {
      const teamFixtures = fixtures.filter((f) => f.home_team_id === team.id || f.away_team_id === team.id).slice(-5);
      if (teamFixtures.length === 0) continue;
      let win = 0,
        draw = 0,
        lose = 0,
        goalsFor = 0,
        goalsAgainst = 0;
      const form: Array<"W" | "D" | "L"> = [];
      for (const f of teamFixtures) {
        const isHomeSide = f.home_team_id === team.id;
        const gf = isHomeSide ? f.home_score : f.away_score;
        const ga = isHomeSide ? f.away_score : f.home_score;
        goalsFor += gf;
        goalsAgainst += ga;
        if (gf > ga) {
          win++;
          form.push("W");
        } else if (gf === ga) {
          draw++;
          form.push("D");
        } else {
          lose++;
          form.push("L");
        }
      }
      rows.push({
        team,
        played: teamFixtures.length,
        win,
        draw,
        lose,
        goalsFor,
        goalsAgainst,
        goalsDiff: goalsFor - goalsAgainst,
        points: win * 3 + draw,
        form,
        nextOpponent: nextOpponents.get(team.id) ?? null,
      });
    }
    return rankRows(rows);
  }

  // filter === "xg": real punkter/V/O/F från säsongens facit (standings),
  // men mål-för/mål-emot/diff ersatta med lagets egna, riktiga xG-tal —
  // rankad efter xG-differens, inte efter poäng.
  const xgByTeam = await getSeasonXgByTeam(supabase, seasonId);
  const rows: Omit<StandingsViewRow, "rank">[] = [];
  for (const s of standingsByTeam.values()) {
    const team = teamById.get(s.team_id);
    const xg = xgByTeam.get(s.team_id);
    if (!team || !xg) continue; // ingen xG-data för laget den säsongen — utelämnas
    rows.push({
      team,
      played: s.win + s.draw + s.lose,
      win: s.win,
      draw: s.draw,
      lose: s.lose,
      goalsFor: fmtXg(xg.xgFor),
      goalsAgainst: fmtXg(xg.xgAgainst),
      goalsDiff: fmtXg(xg.xgFor - xg.xgAgainst),
      points: s.points,
      form: formToArray(s.form),
      nextOpponent: nextOpponents.get(s.team_id) ?? null,
    });
  }
  return [...rows]
    .sort((a, b) => b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
