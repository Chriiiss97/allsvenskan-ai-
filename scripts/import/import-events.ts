import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiEventResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";
import { buildEventRows, syncFixtureEvents } from "./event-sync";

// Ultra: gott om marginal för att täcka alla avslutade matcher i en enda
// körning (var 60 på gratisplanens 100/dag). Höjd 2026-08-20 från 800 till
// 3000 efter att 800 visade sig vara för lågt när scopet växte till
// 2016–2026 (2549 avslutade matcher) — ett enskilt 800-tak fick då körningen
// att tyst stanna av efter bara en delmängd, trots att den loggade "Klart".
const DEFAULT_MAX_FIXTURES_PER_RUN = 3000;

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
 *
 * `supabase`-parametern (steg 10): valfri, defaultar till scriptets egna
 * admin-klient (denna fil körs alltid via tsx, aldrig buntad av Next).
 * Cron-routes under app/api/cron/* skickar istället in en klient byggd med
 * lib/supabase/admin.ts (server-only-skyddad) — samma funktion återanvänds
 * då av både CLI:t och produktionens schemaläggning, ingen kod dubbleras.
 */
export async function importFixtureEvents(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);

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

    // Fas 20: avstämmande skrivning istället för rad-för-rad-upsert — se
    // event-sync.ts. Den här körningen var HALVA orsaken till de dubbletter
    // som mättes upp på match #3457: live-ticken sparade händelsen först,
    // och det här steget sparade samma händelse en gång till efteråt när
    // källan saknade spelar-id.
    const rows = await buildEventRows(fixture.id, events, {
      team: (t) => teamCache.ensure(t),
      player: (id) => playerCache.lookup(id),
    });
    const result = await syncFixtureEvents(supabase, fixture.id, rows);

    await supabase
      .from("fixture")
      .update({ events_synced_at: new Date().toISOString() })
      .eq("id", fixture.id);

    console.log(
      `  ✓ Match ${fixture.external_id}: ${events.length} händelser${result.removed > 0 ? ` (${result.removed} dubblett/föräldralös rad borttagen)` : ""}`
    );
  }
}
