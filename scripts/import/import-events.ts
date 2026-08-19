import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiEventResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";

const DEFAULT_MAX_FIXTURES_PER_RUN = 60; // lämnar marginal under 100 anrop/dag

/**
 * Hämtar matchhändelser (mål, kort, byten) per match. Till skillnad från
 * lag-/spelarimporten kostar det HÄR ETT API-ANROP PER MATCH — kör därför
 * separat ('npm run import events'), inte som en del av 'all', och med ett
 * tak per körning så flera dagars körningar kan fylla på gradvis inom
 * gratiskvoten.
 *
 * Återupptagbar: hoppar över matcher som redan har events_synced_at satt
 * (se migration 0004), så en avbruten eller upprepad körning inte hämtar om
 * samma matcher.
 */
export async function importFixtureEvents(maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN) {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .is("events_synced_at", null)
    .in("status", ["FT", "AET", "PEN"]) // bara avslutade matcher har fullständiga händelser
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);

  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta händelser för (eller inga matcher importerade än).");
    return;
  }

  console.log(
    `Hämtar händelser för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`
  );

  for (const fixture of fixtures) {
    if (!fixture.external_id) continue;

    const { data: events } = await apiFootballGet<ApiEventResponse>("/fixtures/events", {
      fixture: fixture.external_id,
    });

    for (const e of events) {
      const teamId = await teamCache.ensure(e.team);

      const playerId = e.player.id ? await lookupPlayerId(supabase, e.player.id) : null;
      const assistPlayerId = e.assist.id ? await lookupPlayerId(supabase, e.assist.id) : null;

      const { error: eventError } = await supabase.from("event").upsert(
        {
          fixture_id: fixture.id,
          team_id: teamId,
          player_id: playerId,
          assist_player_id: assistPlayerId,
          type: e.type.toLowerCase(),
          detail: e.detail,
          comments: e.comments,
          minute: e.time.elapsed,
          extra_minute: e.time.extra,
        },
        { onConflict: "fixture_id,player_id,minute,type,detail" }
      );
      if (eventError) throw eventError;
    }

    await supabase
      .from("fixture")
      .update({ events_synced_at: new Date().toISOString() })
      .eq("id", fixture.id);

    console.log(`  ✓ Match ${fixture.external_id}: ${events.length} händelser`);
  }
}

async function lookupPlayerId(
  supabase: ReturnType<typeof createAdminClient>,
  externalId: number
): Promise<number | null> {
  const { data } = await supabase
    .from("player")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}
