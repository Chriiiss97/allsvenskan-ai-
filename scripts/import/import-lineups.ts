import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiLineupResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";

const DEFAULT_MAX_FIXTURES_PER_RUN = 3000; // komfortabel marginal över dagens 2549 avslutade matcher

/**
 * Hämtar formation/startelva/avbytare per match (ett anrop/match).
 * Återupptagbar via fixture.lineups_synced_at, samma mönster som
 * import-events.ts.
 */
export async function importLineups(maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN) {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .is("lineups_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);

  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta laguppställningar för.");
    return;
  }
  console.log(`Hämtar laguppställningar för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  for (const fixture of fixtures) {
    if (!fixture.external_id) continue;

    const { data: lineups } = await apiFootballGet<ApiLineupResponse>("/fixtures/lineups", {
      fixture: fixture.external_id,
    });

    for (const l of lineups) {
      const teamId = await teamCache.ensure(l.team);
      const coachId = l.coach ? await lookupCoachId(supabase, l.coach.id) : null;

      const { data: lineupRow, error: lineupError } = await supabase
        .from("fixture_lineup")
        .upsert(
          { fixture_id: fixture.id, team_id: teamId, coach_id: coachId, formation: l.formation },
          { onConflict: "fixture_id,team_id" }
        )
        .select("id")
        .single();
      if (lineupError || !lineupRow) throw lineupError ?? new Error("Kunde inte spara laguppställning");

      const allPlayers = [
        ...l.startXI.map((p) => ({ entry: p, isStarter: true })),
        ...l.substitutes.map((p) => ({ entry: p, isStarter: false })),
      ];
      for (const { entry, isStarter } of allPlayers) {
        const playerId = await playerCache.lookup(entry.player.id);
        const { error: playerError } = await supabase.from("fixture_lineup_player").upsert(
          {
            fixture_lineup_id: lineupRow.id,
            player_id: playerId,
            is_starter: isStarter,
            shirt_number: entry.player.number,
            position: entry.player.pos,
            grid: entry.player.grid,
          },
          { onConflict: "fixture_lineup_id,player_id" }
        );
        if (playerError) throw playerError;
      }
    }

    await supabase.from("fixture").update({ lineups_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ Match ${fixture.external_id}: ${lineups.length} laguppställningar`);
  }
}

async function lookupCoachId(
  supabase: ReturnType<typeof createAdminClient>,
  externalId: number
): Promise<number | null> {
  const { data } = await supabase.from("coach").select("id").eq("external_id", externalId).maybeSingle();
  return data?.id ?? null;
}
