import { importFixtureEvents } from "./import-events";
import { importLineups } from "./import-lineups";
import { importTeamStats } from "./import-team-stats";
import { importPlayerStats } from "./import-player-stats";
import { createAdminClient } from "./admin-client";
import { computeEventsComplete } from "../../lib/football/match-completeness";

/**
 * Steg 7 — post-match & datakvalitet. Två delar:
 *
 * 7a) "Sista full refresh" för nyss avslutade matcher. Detta är INTE ny
 *     hämtningslogik — import-events.ts/import-lineups.ts/import-team-stats.ts/
 *     import-player-stats.ts filtrerar redan på FT/AET/PEN + en null
 *     sync-flagga (samma återupptagbara mönster som steg 3–4). Nyckelinsikten:
 *     steg 6:s live-pipeline.ts sätter ALDRIG dessa fyra sync-flaggor (den
 *     skriver events direkt under matchen, men rör inte fixture.*_synced_at)
 *     — så en match som just blivit FT faller naturligt igenom till dessa
 *     fyra script första gången den här funktionen körs efter matchen, och
 *     får då en riktig, komplett efterhandshämtning istället för att bara
 *     luta sig på vad live-tick:arna hann fånga.
 *
 * 7b) Avstämning: jämför summerade mål-events (självmål korrekt krediterat
 *     motståndaren) mot fixture.home_score/away_score för ALLA avslutade
 *     matcher med synkade events — samma delade logik som getMatchReport
 *     använder vid läsning (lib/football/match-completeness.ts), så batch-
 *     jobbet och produkten aldrig kan säga emot varandra. Resultatet loggas
 *     till ingestion_log (status 'partial' om något avviker) istället för
 *     att skriva en ny kolumn på fixture — vi VET redan att äldre säsonger
 *     har en äkta källucka (kort/byten rikt täckta, mål inte, se tidigare
 *     kvalitetskontroll), så syftet här är synlighet över tid, inte att
 *     "fixa" en historisk lucka som inte går att fixa.
 *
 * Precis som steg 5/6 var det här tänkt att köras UPPREPAT (efter varje
 * match, eller på ett schema) av en extern schemaläggare — sedan steg 10
 * är det app/api/cron/finalize/route.ts (Vercel Cron).
 *
 * `supabase`-param: se import-events.ts — låter cron-routen skicka in en
 * app-säker klient (lib/supabase/admin.ts) istället för scriptets egen,
 * och samma klient återanvänds genom hela 7a+7b istället för att skapas om.
 */
/**
 * Steg 7a fristående (Fas 20, 2026-08-23) — de fyra importerna som gör en
 * nyss avslutad match komplett. Bruten ur finalizeMatches så live-pipelinen
 * kan köra EXAKT samma sak i samma sekund som matchen slutsignaleras, istället
 * för att låta produkten stå med bara live-tickarnas delvisa data ända till
 * kl 03:00 nästa dygn (mätt: en match som slutade 16:30 fick sin riktiga
 * eventlista, xG och spelarstatistik först 10,5 timmar senare).
 *
 * Alla fyra filtrerar själva på "avslutad status + sync-flaggan är null", så
 * funktionen är idempotent och ett no-op när ingenting väntar — säker att
 * anropa ofta. Steg 7b (avstämningen) ingår MEDVETET inte: den går igenom
 * alla 2500+ avslutade matcher och hör hemma i nattpasset, inte i en
 * live-tick som ska vara klar på sekunder.
 */
export async function runPostMatchImports(supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  await importFixtureEvents(undefined, supabase);
  await importLineups(undefined, supabase);
  await importTeamStats(undefined, supabase);
  await importPlayerStats(undefined, supabase);
}

export async function finalizeMatches(supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  console.log("--- Steg 7a: sista full-refresh för nyss avslutade matcher ---");
  await runPostMatchImports(supabase);

  console.log("\n--- Steg 7b: avstämning mål-events vs facit ---");

  // Supabase begränsar ett osidat .select() till 1000 rader per default —
  // exakt buggen som gav en falsk 15%-siffra i steg 4:s verifiering (se
  // planen). Sidnumrerar därför explicit i steg om 1000 istället för att
  // lita på ett enda anrop.
  type FixtureRow = { id: number; status: string; home_score: number | null; away_score: number | null; home_team_id: number | null };
  const fixtures: FixtureRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("fixture")
      .select("id, status, home_score, away_score, home_team_id")
      .eq("status", "FT")
      .not("events_synced_at", "is", null)
      .range(from, from + PAGE - 1)
      .returns<FixtureRow[]>();
    if (error) throw error;
    if (!page || page.length === 0) break;
    fixtures.push(...page);
    if (page.length < PAGE) break;
  }

  if (fixtures.length === 0) {
    console.log("Inga avslutade matcher med synkade events att stämma av.");
    return;
  }

  // Events hämtas i grupper om 200 fixture-id:n åt gången (inte en fråga per
  // match) — samma sorts skydd mot orimligt stora IN()-listor som resten av
  // importscripten, men här kostar det bara Supabase-läsningar, inga
  // API-Football-anrop.
  const CHUNK = 200;
  const eventsByFixture = new Map<number, { type: string; detail: string | null; team_id: number | null }[]>();
  for (let i = 0; i < fixtures.length; i += CHUNK) {
    const chunkIds = fixtures.slice(i, i + CHUNK).map((f) => f.id);
    const { data: events, error: eventsError } = await supabase
      .from("event")
      .select("fixture_id, type, detail, team_id")
      .in("fixture_id", chunkIds)
      .returns<{ fixture_id: number; type: string; detail: string | null; team_id: number | null }[]>();
    if (eventsError) throw eventsError;
    for (const e of events ?? []) {
      const list = eventsByFixture.get(e.fixture_id) ?? [];
      list.push({ type: e.type, detail: e.detail, team_id: e.team_id });
      eventsByFixture.set(e.fixture_id, list);
    }
  }

  let complete = 0;
  const incompleteIds: number[] = [];
  for (const f of fixtures) {
    const isComplete = computeEventsComplete(f, eventsByFixture.get(f.id) ?? []);
    if (isComplete) complete++;
    else incompleteIds.push(f.id);
  }

  const pct = ((complete / fixtures.length) * 100).toFixed(1);
  console.log(`${complete}/${fixtures.length} avslutade matcher (${pct}%) har mål-events som stämmer mot facit.`);
  if (incompleteIds.length > 0) {
    console.log(
      `${incompleteIds.length} matcher avviker (visas redan ärligt i produkten via eventsComplete, INTE ett importfel — känd källucka för äldre säsonger): ${incompleteIds
        .slice(0, 20)
        .join(", ")}${incompleteIds.length > 20 ? ", …" : ""}`
    );
  }

  const { error: logError } = await supabase.from("ingestion_log").insert({
    job_name: "finalize-match",
    endpoint: "n/a (lokal avstämning, inga API-anrop)",
    params: { checked: fixtures.length },
    calls_used: 0,
    rows_written: complete,
    status: incompleteIds.length > 0 ? "partial" : "success",
    error_message:
      incompleteIds.length > 0 ? `${incompleteIds.length} matcher med avvikande mål-events: ${incompleteIds.slice(0, 50).join(",")}` : null,
    finished_at: new Date().toISOString(),
  });
  if (logError) throw logError;
}
