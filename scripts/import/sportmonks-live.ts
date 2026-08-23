import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";
import { IN_PLAY_STATUSES } from "../../lib/football/live-status";

/**
 * Fas 21 (2026-08-23) — Sportmonks LIVE-poll för matchhubben.
 *
 * Skild från sportmonks-import-match-data.ts:s pollSportmonksLiveMatchData,
 * som hämtar `events;trends;weatherreport;metadata` och gör delete+insert per
 * fixture. Den här hämtar det som matchhubben behöver och som ingen annan
 * körning tar: KLOCKAN (periods), den löpande KOMMENTAREN (comments) och den
 * fulla LIVE-STATISTIKEN (statistics).
 *
 * ALLT I ETT ANROP. Sportmonks includes kostar inget extra — `include=
 * periods;comments;statistics;trends;pressure` ger fem dataset för priset av
 * en request. Med kvoten 2000/timme per entitet (bekräftat i svarshuvudena)
 * och fyra samtidiga matcher kostar 30-sekunderspolling 480 anrop/timme, med
 * god marginal. Att hämta samma sak i fem separata anrop hade tagit 2400 och
 * spräckt kvoten.
 *
 * VERIFIERAT MOT EN PÅGÅENDE MATCH (IFK Göteborg–Elfsborg 2026-08-23, minut
 * 17–22, sportmonks_id 19635909) innan den här filen skrevs — inte antaget
 * från dokumentationen:
 *   periods     → 1 rad, { started: 1787486426, minutes: 22, seconds: 39,
 *                 ticking: true, has_timer: true, period_length: 45 }
 *   comments    → 7 rader vid minut 17
 *   statistics  → 34 typer per lag (Fouls, Free Kicks, Offsides, Saves,
 *                 Passes, Key Passes, Tackles, Duels Won, Big Chances …)
 *   trends      → 258 rader, samma typer men per minut
 *
 * OBS `include=commentaries` finns INTE (Sportmonks svarar 404 "does not
 * exist on Fixture") — rätt namn är `comments`. Testat, inte gissat.
 */

const LIVE_INCLUDE = "periods;comments;statistics;trends;pressure";

/** Hur länge efter avspark vi fortsätter betrakta en match som möjligen pågående. */
const LIVE_WINDOW_HOURS = 4;

interface SportmonksPeriod {
  id: number;
  type_id: number | null;
  description: string | null;
  started: number | null;
  ended: number | null;
  counts_from: number | null;
  period_length: number | null;
  time_added: number | null;
  minutes: number | null;
  seconds: number | null;
  ticking: boolean | null;
  has_timer: boolean | null;
  sort_order: number | null;
}

interface SportmonksComment {
  id: number;
  comment: string;
  minute: number | null;
  extra_minute: number | null;
  is_goal: boolean | null;
  is_important: boolean | null;
  order: number | null;
}

interface SportmonksStatistic {
  type_id: number;
  participant_id: number;
  data: { value?: number | string | null } | null;
}

interface SportmonksTrend {
  participant_id: number;
  type_id: number;
  minute: number;
  value: number | string | null;
}

interface SportmonksPressure {
  participant_id: number;
  minute: number;
  pressure: number | string | null;
  id: number;
}

interface SportmonksLiveFixture {
  id: number;
  periods?: SportmonksPeriod[];
  comments?: SportmonksComment[];
  statistics?: SportmonksStatistic[];
  trends?: SportmonksTrend[];
  pressure?: SportmonksPressure[];
}

/** Sportmonks blandar tal och numeriska strängar — normalisera en gång. */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export interface SportmonksLiveResult {
  fixtures: number;
  apiCalls: number;
  comments: number;
  stats: number;
  /** Sant om någon skrivning föll på att Fas 21-migrationen inte är körd. */
  missingTables: boolean;
}

/**
 * En tabell som saknas (migrationen inte körd) ska degradera funktionen, inte
 * fälla hela live-ticken. Supabase svarar PGRST205/42P01 för okänd tabell.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

/**
 * Exporterad för att kunna köras mot EN bestämd match — t.ex. en nyss
 * avslutad, där Sportmonks fortfarande har kommentaren och statistiken kvar
 * men runSportmonksLiveTick inte längre plockar upp den (den filtrerar på
 * pågående status). Används av verifiering och engångs-backfill.
 */
export async function writeLiveDataForFixture(
  supabase: ReturnType<typeof createAdminClient>,
  fixture: { id: number; sportmonks_id: number },
  teamIdBySm: Map<number, number>
): Promise<{ comments: number; stats: number; missingTables: boolean }> {
  const { data } = await sportmonksGet<SportmonksLiveFixture>(`football/fixtures/${fixture.sportmonks_id}`, {
    include: LIVE_INCLUDE,
  });

  let missingTables = false;

  // --- Klockan -------------------------------------------------------------
  // Upsert, inte delete+insert: raden är matchens klockankare och läses av
  // varje öppen matchvy. Att radera och skapa om den varje halvminut hade
  // gett ett litet fönster där klockan inte finns.
  for (const p of data.periods ?? []) {
    const { error } = await supabase.from("fixture_period").upsert(
      {
        fixture_id: fixture.id,
        sportmonks_period_id: p.id,
        type_id: p.type_id,
        description: p.description,
        started_at: unixToIso(p.started),
        ended_at: unixToIso(p.ended),
        counts_from: p.counts_from,
        period_length: p.period_length,
        time_added: p.time_added,
        minutes: p.minutes,
        seconds: p.seconds,
        ticking: p.ticking ?? false,
        has_timer: p.has_timer ?? false,
        sort_order: p.sort_order,
      },
      { onConflict: "fixture_id,sportmonks_period_id" }
    );
    if (isMissingTable(error)) missingTables = true;
    else if (error) throw error;
  }

  // --- Kommentaren ---------------------------------------------------------
  // Upsert på Sportmonks eget id: kommentaren är append-only hos källan, och
  // en rad kan komma i en senare hämtning med rättad text.
  const comments = data.comments ?? [];
  if (comments.length > 0) {
    const { error } = await supabase.from("fixture_comment").upsert(
      comments.map((c) => ({
        fixture_id: fixture.id,
        sportmonks_comment_id: c.id,
        comment: c.comment,
        minute: c.minute,
        extra_minute: c.extra_minute,
        is_goal: c.is_goal ?? false,
        is_important: c.is_important ?? false,
        sort_order: c.order,
      })),
      { onConflict: "fixture_id,sportmonks_comment_id" }
    );
    if (isMissingTable(error)) missingTables = true;
    else if (error) throw error;
  }

  // --- Live-statistiken ----------------------------------------------------
  const statistics = data.statistics ?? [];
  if (statistics.length > 0) {
    const rows = statistics.map((s) => ({
      fixture_id: fixture.id,
      team_id: teamIdBySm.get(s.participant_id) ?? null,
      sportmonks_team_id: s.participant_id,
      type_id: s.type_id,
      value: num(s.data?.value),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("fixture_live_team_stat").upsert(rows, {
      onConflict: "fixture_id,sportmonks_team_id,type_id",
    });
    if (isMissingTable(error)) missingTables = true;
    else if (error) throw error;
  }

  // --- Trender (momentumgrafens underlag) ----------------------------------
  // Delete+insert per fixture: en hämtning representerar Sportmonks
  // fullständiga aktuella vy, inte ett tillägg (samma mönster som
  // sportmonks-import-match-data.ts redan använder för samma tabell).
  const trends = data.trends ?? [];
  if (trends.length > 0) {
    await supabase.from("fixture_stat_trend").delete().eq("fixture_id", fixture.id);
    const { error } = await supabase.from("fixture_stat_trend").insert(
      trends.map((t) => ({
        fixture_id: fixture.id,
        team_id: teamIdBySm.get(t.participant_id) ?? null,
        sportmonks_team_id: t.participant_id,
        type_id: t.type_id,
        minute: t.minute,
        value: num(t.value),
      }))
    );
    if (error) throw error;
  }

  // --- Pressure (momentum) -------------------------------------------------
  const pressure = data.pressure ?? [];
  if (pressure.length > 0) {
    await supabase.from("fixture_pressure_index").delete().eq("fixture_id", fixture.id);
    const rows = pressure
      .map((p) => ({
        fixture_id: fixture.id,
        team_id: teamIdBySm.get(p.participant_id) ?? null,
        minute: p.minute,
        pressure: num(p.pressure),
        sportmonks_row_id: p.id,
      }))
      // team_id är NOT NULL i fixture_pressure_index — en omappad klubb
      // hoppas över istället för att fälla hela skrivningen.
      .filter((r): r is typeof r & { team_id: number; pressure: number } => r.team_id !== null && r.pressure !== null);
    if (rows.length > 0) {
      const { error } = await supabase.from("fixture_pressure_index").insert(rows);
      if (error) throw error;
    }
  }

  return { comments: comments.length, stats: statistics.length, missingTables };
}

/**
 * En pollningsomgång mot Sportmonks för alla matcher som kan tänkas pågå.
 * Anropas av runLiveTick (scripts/import/live-pipeline.ts) i samma tick som
 * API-Football-hämtningen, så de två källorna alltid speglar samma ögonblick.
 */
export async function runSportmonksLiveTick(
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<SportmonksLiveResult> {
  const windowStart = new Date(Date.now() - LIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id")
    .not("sportmonks_id", "is", null)
    .in("status", IN_PLAY_STATUSES)
    .gte("kickoff_at", windowStart)
    .returns<{ id: number; sportmonks_id: number }[]>();
  if (error) throw error;

  const live = fixtures ?? [];
  if (live.length === 0) return { fixtures: 0, apiCalls: 0, comments: 0, stats: 0, missingTables: false };

  const { data: teams } = await supabase.from("team").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const teamIdBySm = new Map((teams ?? []).map((t) => [t.sportmonks_id as number, t.id]));

  let comments = 0;
  let stats = 0;
  let missingTables = false;
  let apiCalls = 0;

  for (const fixture of live) {
    try {
      const result = await writeLiveDataForFixture(supabase, fixture, teamIdBySm);
      apiCalls++;
      comments += result.comments;
      stats += result.stats;
      if (result.missingTables) missingTables = true;
    } catch (err) {
      // Sportmonks är KOMPLEMENTET, inte grunden — API-Football-delen av
      // ticken har redan skrivit status/ställning/händelser. Ett fel här får
      // inte göra att den datan rullas tillbaka eller att ticken avbryts.
      apiCalls++;
      console.warn(`  ! Sportmonks live misslyckades för fixture ${fixture.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { fixtures: live.length, apiCalls, comments, stats, missingTables };
}
