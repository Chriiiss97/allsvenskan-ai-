import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiFixturePlayersResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";

const DEFAULT_MAX_FIXTURES_PER_RUN = 3000; // komfortabel marginal över dagens 2549 avslutade matcher

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace("%", "");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

/**
 * Per-match spelarstatistik (ett anrop/match, returnerar båda lagen i ett
 * svep). Skiljer sig från säsongsaggregerade `statistics` — det här är EN
 * rad per spelare och match, grunden för consistency/form-analys i
 * analysmotorn (steg 8–9).
 */
export async function importPlayerStats(maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN) {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .is("player_stats_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);

  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta spelarstatistik för.");
    return;
  }
  console.log(`Hämtar spelarstatistik för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  for (const fixture of fixtures) {
    if (!fixture.external_id) continue;

    const { data: teams } = await apiFootballGet<ApiFixturePlayersResponse>("/fixtures/players", {
      fixture: fixture.external_id,
    });

    let saved = 0;
    for (const t of teams) {
      const teamId = await teamCache.ensure(t.team);

      for (const p of t.players) {
        const stat = p.statistics[0];
        if (!stat) continue;
        const playerId = await playerCache.lookup(p.player.id);

        const { error: statError } = await supabase.from("fixture_player_stats").upsert(
          {
            fixture_id: fixture.id,
            team_id: teamId,
            player_id: playerId,
            minutes_played: stat.games.minutes,
            position: stat.games.position,
            shirt_number: stat.games.number,
            rating: stat.games.rating ? Number(stat.games.rating) : null,
            is_captain: stat.games.captain,
            is_substitute: stat.games.substitute,
            shots_total: stat.shots.total,
            shots_on_target: stat.shots.on,
            goals: stat.goals.total,
            goals_conceded: stat.goals.conceded,
            assists: stat.goals.assists,
            saves: stat.goals.saves,
            passes_total: stat.passes.total,
            passes_key: stat.passes.key,
            passes_accuracy: toNumber(stat.passes.accuracy),
            tackles_total: stat.tackles.total,
            tackles_blocks: stat.tackles.blocks,
            tackles_interceptions: stat.tackles.interceptions,
            duels_total: stat.duels.total,
            duels_won: stat.duels.won,
            dribbles_attempts: stat.dribbles.attempts,
            dribbles_success: stat.dribbles.success,
            dribbles_past: stat.dribbles.past,
            fouls_drawn: stat.fouls.drawn,
            fouls_committed: stat.fouls.committed,
            offsides: stat.offsides,
            yellow_cards: stat.cards.yellow,
            red_cards: stat.cards.red,
            penalty_won: stat.penalty.won,
            penalty_committed: stat.penalty.commited,
            penalty_scored: stat.penalty.scored,
            penalty_missed: stat.penalty.missed,
            penalty_saved: stat.penalty.saved,
          },
          { onConflict: "fixture_id,player_id" }
        );
        if (statError) throw statError;
        saved += 1;
      }
    }

    await supabase.from("fixture").update({ player_stats_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ Match ${fixture.external_id}: ${saved} spelarstatistikrader`);
  }
}
