import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup } from "./position-group";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Fas 15 (Complete Scout Player Card) — match-för-match-logg
 * ============================================================================
 * NY, fristående fil. Ren läsning av redan importerad `fixture_player_stats`
 * + `fixture` — INGEN ny import, INGEN ändring av OVR/DNA/Rating. Rör INTE
 * rating-aggregates.ts (som redan summerar samma tabell till säsongstal) —
 * det här är en helt separat match-för-match-vy, inte ett nytt aggregat.
 *
 * Målvaktsfälten (`saves`/`goals_conceded`) är alltid med i varje rad —
 * `isGoalkeeper` styr bara vilka fält UI:t väljer att visa, ingen egen
 * databasfråga per position.
 */

export interface PlayerMatchLogEntry {
  fixtureId: number;
  kickoffAt: string;
  opponentName: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  /** null om matchen inte är avgjord (saknar resultat) — aldrig gissat. */
  result: "win" | "draw" | "loss" | null;
  minutesPlayed: number | null;
  /** null om laguppställningens avbytarflagga saknas för matchen. */
  isStarter: boolean | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  passesTotal: number | null;
  tacklesTotal: number | null;
  saves: number | null;
  goalsConceded: number | null;
  /** Etablerad branschkonvention: 0 insläppta OCH minst 60 spelade minuter. null om vi saknar underlag för att avgöra. Se även lib/ovr/metrics.ts:CLEAN_SHEET_MIN_MINUTES, som använder 45 för hållna nollor i betyget. */
  cleanSheet: boolean | null;
}

export interface PlayerMatchLog {
  available: boolean;
  isGoalkeeper: boolean;
  /** Fallande kickoff_at — senaste match först. */
  entries: PlayerMatchLogEntry[];
}

interface FixtureRow {
  id: number;
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  home: { name: string } | null;
  away: { name: string } | null;
}

interface StatRow {
  fixture_id: number;
  team_id: number;
  minutes_played: number | null;
  is_substitute: boolean | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  passes_total: number | null;
  tackles_total: number | null;
  saves: number | null;
  goals_conceded: number | null;
}

export async function getPlayerMatchLog(
  supabase: Supabase,
  params: { playerId: number; seasonId: number; position: string | null }
): Promise<PlayerMatchLog> {
  const isGoalkeeper = getPositionGroup(params.position)?.group === "goalkeeper";

  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select(
      "id, kickoff_at, home_team_id, away_team_id, home_score, away_score, home:home_team_id(name), away:away_team_id(name)"
    )
    .eq("season_id", params.seasonId)
    .in("status", ["FT", "AET", "PEN"])
    .returns<FixtureRow[]>();
  if (fixtureError) throw fixtureError;
  if (!fixtures || fixtures.length === 0) return { available: false, isGoalkeeper, entries: [] };

  const fixtureIds = fixtures.map((f) => f.id);
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  const { data: statRows, error: statError } = await supabase
    .from("fixture_player_stats")
    .select(
      "fixture_id, team_id, minutes_played, is_substitute, rating, goals, assists, yellow_cards, red_cards, shots_total, shots_on_target, passes_total, tackles_total, saves, goals_conceded"
    )
    .eq("player_id", params.playerId)
    .in("fixture_id", fixtureIds)
    .returns<StatRow[]>();
  if (statError) throw statError;
  if (!statRows || statRows.length === 0) return { available: false, isGoalkeeper, entries: [] };

  const entries: PlayerMatchLogEntry[] = statRows
    .map((r) => {
      const fixture = fixtureById.get(r.fixture_id);
      if (!fixture) return null;
      const isHome = fixture.home_team_id === r.team_id;
      const teamScore = isHome ? fixture.home_score : fixture.away_score;
      const opponentScore = isHome ? fixture.away_score : fixture.home_score;
      const opponentName = (isHome ? fixture.away : fixture.home)?.name ?? "Okänt lag";
      const result: PlayerMatchLogEntry["result"] =
        teamScore !== null && opponentScore !== null
          ? teamScore > opponentScore
            ? "win"
            : teamScore < opponentScore
              ? "loss"
              : "draw"
          : null;

      return {
        fixtureId: r.fixture_id,
        kickoffAt: fixture.kickoff_at,
        opponentName,
        isHome,
        teamScore,
        opponentScore,
        result,
        minutesPlayed: r.minutes_played,
        isStarter: r.is_substitute === null ? null : !r.is_substitute,
        rating: r.rating,
        goals: r.goals,
        assists: r.assists,
        yellowCards: r.yellow_cards,
        redCards: r.red_cards,
        shotsTotal: r.shots_total,
        shotsOnTarget: r.shots_on_target,
        passesTotal: r.passes_total,
        tacklesTotal: r.tackles_total,
        saves: r.saves,
        goalsConceded: r.goals_conceded,
        cleanSheet:
          r.goals_conceded !== null && r.minutes_played !== null
            ? r.goals_conceded === 0 && r.minutes_played >= 60
            : null,
      };
    })
    .filter((e): e is PlayerMatchLogEntry => e !== null)
    .sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());

  if (entries.length === 0) return { available: false, isGoalkeeper, entries: [] };
  return { available: true, isGoalkeeper, entries };
}
