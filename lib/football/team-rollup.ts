import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * DERIVED-lager (steg 8 av Ultra-plan-datalagret): lagnivå-rollups och
 * per-match-jämförelser byggda ovanpå `fixture_team_stats` — en tabell som
 * importerats sedan steg 4 (possession/skott/hörnor/xG/goals_prevented per
 * lag och match) men som inte exponerats någonstans i produkten än (se
 * API_GAP_ANALYSIS.md, "känt men ej kodat"). Ren beräkning på redan sparad
 * data — 0 API-anrop — och en delad byggsten så steg 9:s Team/Match DNA
 * inte behöver skriva sin egen aggregeringsfråga.
 */

interface TeamStatsRow {
  team_id: number;
  possession_pct: number | null;
  shots_total: number | null;
  shots_on_goal: number | null;
  corners: number | null;
  fouls: number | null;
  passes_total: number | null;
  passes_accurate: number | null;
  expected_goals: number | null;
  goals_prevented: number | null;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round(((nums.reduce((a, b) => a + b, 0) / nums.length) + Number.EPSILON) * 10) / 10;
}

export interface TeamSeasonRollup {
  /** Antal avslutade matcher med sparad lagstatistik — kan vara färre än totalt spelade matcher. */
  matchesWithStats: number;
  possessionPct: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  /** Beräknad från passes_accurate/passes_total, inte det råa passes_pct-fältet — samma tal, men robust mot null-täljare. */
  passesAccuracyPct: number | null;
  /**
   * null om ALDRIG ifyllt den säsongen — bekräftat i steg 1 att fältet kan
   * saknas (var null i referensmatchen), täckningen varierar. Visa aldrig
   * som 0, alltid som "ej tillgängligt" i UI:t som konsumerar detta.
   */
  expectedGoals: number | null;
  goalsPrevented: number | null;
}

/** Snitt över en säsongs avslutade matcher för ETT lag — grunden för Team DNA (steg 9). */
export async function getTeamSeasonRollup(supabase: Supabase, params: { teamId: number; seasonId: number }): Promise<TeamSeasonRollup | null> {
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select("id")
    .eq("season_id", params.seasonId)
    .eq("status", "FT")
    .or(`home_team_id.eq.${params.teamId},away_team_id.eq.${params.teamId}`);
  if (fixtureError) throw fixtureError;

  const fixtureIds = (fixtures ?? []).map((f) => f.id);
  if (fixtureIds.length === 0) return null;

  const { data: statsRows, error: statsError } = await supabase
    .from("fixture_team_stats")
    .select("team_id, possession_pct, shots_total, shots_on_goal, corners, fouls, passes_total, passes_accurate, expected_goals, goals_prevented")
    .eq("team_id", params.teamId)
    .in("fixture_id", fixtureIds)
    .returns<TeamStatsRow[]>();
  if (statsError) throw statsError;

  const rows = statsRows ?? [];
  if (rows.length === 0) return null;

  return {
    matchesWithStats: rows.length,
    possessionPct: avg(rows.map((r) => r.possession_pct)),
    shotsTotal: avg(rows.map((r) => r.shots_total)),
    shotsOnTarget: avg(rows.map((r) => r.shots_on_goal)),
    corners: avg(rows.map((r) => r.corners)),
    fouls: avg(rows.map((r) => r.fouls)),
    passesAccuracyPct: avg(rows.map((r) => (r.passes_total ? ((r.passes_accurate ?? 0) / r.passes_total) * 100 : null))),
    expectedGoals: avg(rows.map((r) => r.expected_goals)),
    goalsPrevented: avg(rows.map((r) => r.goals_prevented)),
  };
}

export interface TeamMatchStats {
  possessionPct: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  expectedGoals: number | null;
  goalsPrevented: number | null;
}

export interface MatchTeamStatsComparison {
  home: TeamMatchStats | null;
  away: TeamMatchStats | null;
}

/** Hemma- vs bortalagets lagstatistik för EN match — den "per-match-aggregeringsvy" steg 8 efterfrågade. */
export async function getMatchTeamStatsComparison(supabase: Supabase, fixtureId: number): Promise<MatchTeamStatsComparison> {
  const { data: fixture, error: fixtureError } = await supabase
    .from("fixture")
    .select("home_team_id, away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureError) throw fixtureError;
  if (!fixture) return { home: null, away: null };

  const { data: rows, error: statsError } = await supabase
    .from("fixture_team_stats")
    .select("team_id, possession_pct, shots_total, shots_on_goal, corners, fouls, expected_goals, goals_prevented")
    .eq("fixture_id", fixtureId)
    .returns<TeamStatsRow[]>();
  if (statsError) throw statsError;

  const forTeam = (teamId: number | null): TeamMatchStats | null => {
    const row = (rows ?? []).find((r) => r.team_id === teamId);
    if (!row) return null;
    return {
      possessionPct: row.possession_pct,
      shotsTotal: row.shots_total,
      shotsOnTarget: row.shots_on_goal,
      corners: row.corners,
      fouls: row.fouls,
      expectedGoals: row.expected_goals,
      goalsPrevented: row.goals_prevented,
    };
  };

  return { home: forTeam(fixture.home_team_id), away: forTeam(fixture.away_team_id) };
}
