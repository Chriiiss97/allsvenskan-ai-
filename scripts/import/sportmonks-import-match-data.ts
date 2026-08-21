import { sportmonksGet } from "../../lib/sportmonks/client";
import type { SportmonksFixtureDetail } from "../../lib/sportmonks/types";
import { createAdminClient } from "./admin-client";
import { SPORTMONKS_FINISHED_STATE_IDS } from "./sportmonks-config";

const DEFAULT_MAX_FIXTURES_PER_RUN = 700;
const MATCHDATA_INCLUDE = "events;trends;weatherreport;metadata";

function parsePct(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw.replace("%", ""));
  return Number.isNaN(n) ? null : n;
}

/**
 * Skriver events/trends/weather/metadata för EN fixture. Delete+insert för
 * events/trends/metadata (representerar Sportmonks fullständiga aktuella
 * vy vid hämtningstillfället, inte en tilläggsavläsning — säkert att köra
 * om upprepade gånger, t.ex. under en live-match). Weather är en enda
 * upsert-rad (kan uppdateras till en mer exakt prognos närmare avspark).
 *
 * Returnerar Sportmonks state_id så anroparen kan avgöra om matchen är
 * färdigspelad (för backfill: markera permanent synkad; för live-poll:
 * fortsätt polla).
 */
export async function writeMatchDataForFixture(
  supabase: ReturnType<typeof createAdminClient>,
  fixture: { id: number; sportmonks_id: number },
  teamIdBySm: Map<number, number>,
  playerIdBySm: Map<number, number>
): Promise<{ stateId: number | null; eventCount: number; trendCount: number }> {
  const { data } = await sportmonksGet<SportmonksFixtureDetail>(`football/fixtures/${fixture.sportmonks_id}`, {
    include: MATCHDATA_INCLUDE,
  });

  // Events: delete+insert (samma mönster som seed-team-facts.ts/match-facts).
  await supabase.from("fixture_sportmonks_event").delete().eq("fixture_id", fixture.id);
  const events = data.events ?? [];
  if (events.length > 0) {
    const rows = events.map((e) => ({
      fixture_id: fixture.id,
      sportmonks_event_id: e.id,
      type_id: e.type_id,
      sub_type_id: e.sub_type_id,
      team_id: teamIdBySm.get(e.participant_id) ?? null,
      sportmonks_team_id: e.participant_id,
      player_id: e.player_id ? (playerIdBySm.get(e.player_id) ?? null) : null,
      sportmonks_player_id: e.player_id,
      related_player_id: e.related_player_id ? (playerIdBySm.get(e.related_player_id) ?? null) : null,
      sportmonks_related_player_id: e.related_player_id,
      player_name: e.player_name,
      related_player_name: e.related_player_name,
      result: e.result,
      info: e.info,
      addition: e.addition,
      minute: e.minute,
      extra_minute: e.extra_minute,
      injured: e.injured,
      on_bench: e.on_bench,
      rescinded: e.rescinded,
      sort_order: e.sort_order,
    }));
    const { error } = await supabase.from("fixture_sportmonks_event").insert(rows);
    if (error) throw error;
  }

  // Trends: delete+insert.
  await supabase.from("fixture_stat_trend").delete().eq("fixture_id", fixture.id);
  const trends = data.trends ?? [];
  if (trends.length > 0) {
    const rows = trends.map((t) => ({
      fixture_id: fixture.id,
      team_id: teamIdBySm.get(t.participant_id) ?? null,
      sportmonks_team_id: t.participant_id,
      type_id: t.type_id,
      minute: t.minute,
      value: t.value,
    }));
    const { error } = await supabase.from("fixture_stat_trend").insert(rows);
    if (error) throw error;
  }

  // Weather: upsert (en rad, kan uppdateras till en färskare prognos).
  if (data.weatherreport) {
    const w = data.weatherreport;
    const { error } = await supabase.from("fixture_weather").upsert(
      {
        fixture_id: fixture.id,
        sportmonks_weather_id: w.id,
        temperature_day: w.temperature?.day ?? null,
        temperature_morning: w.temperature?.morning ?? null,
        temperature_evening: w.temperature?.evening ?? null,
        temperature_night: w.temperature?.night ?? null,
        feels_like_day: w.feels_like?.day ?? null,
        wind_speed: w.wind?.speed ?? null,
        wind_direction: w.wind?.direction ?? null,
        humidity_pct: parsePct(w.humidity),
        pressure: w.pressure,
        clouds_pct: parsePct(w.clouds),
        description: w.description,
        report_type: w.type,
        raw: w,
      },
      { onConflict: "fixture_id" }
    );
    if (error) throw error;
  }

  // Metadata: upsert per type_id.
  const metadata = data.metadata ?? [];
  for (const m of metadata) {
    const { error } = await supabase
      .from("fixture_sportmonks_metadata")
      .upsert(
        { fixture_id: fixture.id, type_id: m.type_id, value_type: m.value_type, values: m.values },
        { onConflict: "fixture_id,type_id" }
      );
    if (error) throw error;
  }

  return { stateId: data.state_id ?? null, eventCount: events.length, trendCount: trends.length };
}

async function loadMaps(supabase: ReturnType<typeof createAdminClient>) {
  const { data: teams } = await supabase.from("team").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const teamIdBySm = new Map((teams ?? []).map((t) => [t.sportmonks_id!, t.id]));
  const { data: players } = await supabase.from("player").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const playerIdBySm = new Map((players ?? []).map((p) => [p.sportmonks_id!, p.id]));
  return { teamIdBySm, playerIdBySm };
}

/**
 * Backfill/löpande synk för FÄRDIGSPELADE matcher (samma _synced_at-mönster
 * som Fas 4/5). Verifierad mot riktiga avslutade matcher denna session.
 */
export async function importSportmonksMatchDataBackfill(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const { teamIdBySm, playerIdBySm } = await loadMaps(supabase);

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, status")
    .not("sportmonks_id", "is", null)
    .is("sportmonks_matchdata_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta matchdata (events/trends/väder/metadata) för.");
    return;
  }
  console.log(`Hämtar matchdata för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  for (const fixture of fixtures) {
    const result = await writeMatchDataForFixture(supabase, fixture as { id: number; sportmonks_id: number }, teamIdBySm, playerIdBySm);
    await supabase.from("fixture").update({ sportmonks_matchdata_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}, state=${result.stateId}): ${result.eventCount} events, ${result.trendCount} trend-rader`);
  }
}

/**
 * LIVE-POLL — EN pollningsomgång ("tick"), samma princip som
 * live-pipeline.ts (API-Football): ingen egen schemaläggning, en extern
 * cron/process måste anropa den upprepat under ett matchfönster.
 *
 * OBEPRÖVAD MOT EN RIKTIG PÅGÅENDE MATCH vid byggtillfället (samma ärliga
 * begränsning som redan gäller live-pipeline.ts) — mekaniken (hitta matcher
 * vars API-Football-status ännu inte är FT, hämta Sportmonks-matchdata,
 * läsa av det RIKTIGA state_id:t från svaret) är verifierad mot redan
 * AVSLUTADE matcher (samma anrop, samma kod), men det verkliga
 * live-beteendet (data som förändras mellan polls, state_id-övergångar)
 * måste bekräftas nästa gång en Allsvenskan-match faktiskt pågår.
 *
 * Skiljer sig medvetet från Fas 4/5/backfill ovan: markerar ALDRIG
 * sportmonks_matchdata_synced_at (matchen är inte färdig än) — det görs
 * bara av importSportmonksMatchDataBackfill när matchen verkligen är FT.
 */
export async function pollSportmonksLiveMatchData(supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  const { teamIdBySm, playerIdBySm } = await loadMaps(supabase);

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, status, kickoff_at")
    .not("sportmonks_id", "is", null)
    .not("status", "in", "(NS,FT,AET,PEN)")
    .gte("kickoff_at", fourHoursAgo)
    .lte("kickoff_at", new Date().toISOString());
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga presumtivt pågående Allsvenskan-matcher just nu.");
    return;
  }
  console.log(`${fixtures.length} presumtivt pågående match(er), pollar Sportmonks matchdata...`);

  for (const fixture of fixtures) {
    const result = await writeMatchDataForFixture(supabase, fixture as { id: number; sportmonks_id: number }, teamIdBySm, playerIdBySm);
    const isFinished = result.stateId !== null && (SPORTMONKS_FINISHED_STATE_IDS as readonly number[]).includes(result.stateId);
    console.log(
      `  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}, sportmonks state_id=${result.stateId}${isFinished ? ", FÄRDIGSPELAD enligt Sportmonks" : ""}): ${result.eventCount} events, ${result.trendCount} trend-rader`
    );
  }
}
