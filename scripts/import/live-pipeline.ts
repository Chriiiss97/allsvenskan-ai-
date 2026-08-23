import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiLiveFixtureResponse, ApiFixtureStatisticsResponse, ApiEventResponse, ApiFixtureResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";
import { createVenueCache } from "./venue-cache";
import { createRefereeCache } from "./referee-cache";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID } from "./config";
import { buildEventRows, syncFixtureEvents } from "./event-sync";
import { runPostMatchImports } from "./finalize-match";
import { runSportmonksLiveTick } from "./sportmonks-live";
import { IN_PLAY_STATUSES, matchPhase } from "../../lib/football/live-status";

/**
 * Steg 6 / Fas 20 — live-match pipeline. EN pollningsomgång (en "tick").
 *
 * Nyckelinsikten från steg 1 står kvar: /fixtures?live=all ger ALLA just nu
 * pågående matcher globalt i ETT anrop — filtreras här ner till Allsvenskan.
 * Det anropet ger status/minut/resultat men INTE possession/skott/hörnor
 * (det kräver /fixtures/statistics per match).
 *
 * ── Vad Fas 20 (2026-08-23) ändrade, och varför ─────────────────────────
 * En mätning av `ingestion_log` inför matchdagen visade att schemaläggaren
 * (GitHub Actions, `2-59/5 * * * *`) bara levererade 52 av 288 förväntade
 * körningar per dygn — mediangap 22,6 min, max 91,5 min. Örgryte–Halmstad
 * 2026-08-22 fick totalt FYRA avläsningar under hela matchen (minut 36, 45,
 * 61, 86). Produkten var alltså i snitt ~20 minuter efter verkligheten.
 * Fyra konkreta följdfel rättas här:
 *
 *  1. `fixture.home_score`/`away_score` uppdaterades ALDRIG under matchen
 *     (bara `status`), så matchlistan visade en pågående match som
 *     "IFK Göteborg –––– Elfsborg · Kommande". Nu skrivs ställningen varje
 *     tick, från samma live=all-svar som redan hämtas.
 *  2. Händelser skrevs med en upsert som tyst dubblerade rader utan
 *     spelar-id — se event-sync.ts. En förutsättning för tätare polling.
 *  3. `referee_id`/`venue_id` sattes bara vid säsongsimporten, alltså innan
 *     domaren ens var utsedd — samtliga 2026-matcher saknade domare. Fylls
 *     nu vid statusövergång, från ett /fixtures?id=-anrop som ändå är
 *     billigt och bara görs så länge uppgiften saknas.
 *  4. Post-match-importen (events/lineups/lagstatistik/spelarstatistik) låg
 *     på en cron kl 03:00, så en match som slutade 16:30 saknade riktig
 *     matchdata hela kvällen. Slutsignalen triggar nu samma import direkt.
 *
 * Funktionen returnerar dessutom en sammanfattning av läget, så en
 * anropande loop (app/api/cron/live/route.ts) kan välja nästa intervall
 * utifrån vad som FAKTISKT pågår istället för ett fast tal.
 */

/** Hur gammal en statistik-avläsning får bli innan vi hämtar en ny. */
const STATS_REFRESH_MINUTES = 3;

/**
 * Hur långt fram vi bryr oss om nästa avspark när vi rapporterar tillbaka
 * till loopen. Matchar pre-match-pipelinens lineup-fönster (120 min) — det
 * är då det börjar hända saker värda att polla för.
 */
const KICKOFF_HORIZON_MINUTES = 120;

export interface LiveTickResult {
  /** Antal Allsvenskan-matcher som pågår just nu (spel eller paus). */
  inPlay: number;
  /** Minuter till nästa avspark, eller null om ingen match startar inom horisonten. */
  minutesToNextKickoff: number | null;
  /** Antal matcher som gick över till ett färdigspelat läge i den här ticken. */
  justFinished: number;
  /** Antal API-Football-anrop ticken förbrukade — loggas, aldrig uppskattat. */
  apiCalls: number;
  /** Antal Sportmonks-anrop (egen kvot, 2000/timme per entitet). */
  sportmonksCalls: number;
}

/**
 * En match som en gång fångades av live-tick:en (fixture.status satt till
 * en pågående-kod, t.ex. "2H") men som sen slutar dyka upp i /fixtures?
 * live=all — API-Football har då redan gått vidare till FT (eller AET/PEN)
 * på sin sida. Ingenting annat i produktionsflödet flyttar bort en fixture-
 * rad FRÅN en pågående-kod: import-fixtures.ts körs bara vid säsongsimport,
 * och finalize-match.ts (steg 7) filtrerar SJÄLV på status="FT" innan den
 * ens tittar på matchen — ett moment 22 utan den här funktionen. Utan
 * stängning blir en match hängandes på t.ex. "2H, minut 86" i databasen för
 * evigt, vilket visas som "LIVE" i produkten långt efter att matchen är
 * slut (upptäckt 2026-08-22 av en användare som jämförde mot FotMob).
 *
 * Frågar EN riktig /fixtures?id=X per kandidat — aldrig gissat resultat.
 * Ingen tidsgräns på avspark här (till skillnad från UI-lagrets 3-timmars
 * "visa som live"-fönster i lib/football/tools.ts:s isFixtureLikelyLive) —
 * en fastnad statusrad ska rättas oavsett hur gammal den är, det är en
 * ren datakorrekthetsfråga, inte en fråga om vad som ska visas som pågår
 * just nu.
 */
async function closeOutStaleLiveFixtures(
  supabase: ReturnType<typeof createAdminClient>,
  currentlyLiveExternalIds: Set<number>
): Promise<{ apiCalls: number; closed: number }> {
  const { data: candidates, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .in("status", IN_PLAY_STATUSES);
  if (error) throw error;

  let apiCalls = 0;
  let closed = 0;
  for (const c of candidates ?? []) {
    if (!c.external_id || currentlyLiveExternalIds.has(c.external_id)) continue;

    const { data: real } = await apiFootballGet<ApiFixtureResponse>("/fixtures", { id: c.external_id });
    apiCalls++;
    const match = real[0];
    if (!match || match.fixture.status.short === c.status) continue;

    const { error: updateError } = await supabase
      .from("fixture")
      .update({ status: match.fixture.status.short, home_score: match.goals.home, away_score: match.goals.away })
      .eq("id", c.id);
    if (updateError) throw updateError;
    if (matchPhase(match.fixture.status.short) === "finished") closed++;
    console.log(
      `  ⟳ Match ${c.id} (external_id ${c.external_id}) hade lämnat live-flödet — status rättad ${c.status} → ${match.fixture.status.short} (${match.goals.home}-${match.goals.away}).`
    );
  }
  return { apiCalls, closed };
}

/**
 * Fyller domare och arena för en match som saknar dem. /fixtures?live=all
 * innehåller INTE de fälten — de kommer bara från den vanliga /fixtures-
 * formen, som vi ändå behöver anropa sällan. Anropas bara vid en
 * statusövergång OCH bara så länge `referee_id` faktiskt saknas, så en match
 * kostar som mest ett fåtal anrop under hela sitt förlopp och noll när
 * uppgiften väl är på plats.
 */
async function backfillFixtureMetadata(
  supabase: ReturnType<typeof createAdminClient>,
  fixture: { id: number; external_id: number },
  caches: { venue: ReturnType<typeof createVenueCache>; referee: ReturnType<typeof createRefereeCache> }
): Promise<number> {
  const { data } = await apiFootballGet<ApiFixtureResponse>("/fixtures", { id: fixture.external_id });
  const match = data[0];
  if (!match) return 1;

  const venueId = await caches.venue.ensure(match.fixture.venue);
  const refereeId = await caches.referee.ensure(match.fixture.referee);

  // Bara fält vi FAKTISKT fick ett värde för skrivs — ett null-svar från
  // API:t ska aldrig nolla en uppgift vi redan har.
  const patch: { referee_id?: number; venue_id?: number; venue_name?: string } = {};
  if (refereeId !== null) patch.referee_id = refereeId;
  if (venueId !== null) patch.venue_id = venueId;
  if (match.fixture.venue.name) patch.venue_name = match.fixture.venue.name;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("fixture").update(patch).eq("id", fixture.id);
    if (error) throw error;
    console.log(`  ℹ Match ${fixture.id}: metadata kompletterad (${Object.keys(patch).join(", ")}).`);
  }
  return 1;
}

/** Minuter till nästa avspark inom horisonten, eller null. */
async function minutesToNextKickoff(supabase: ReturnType<typeof createAdminClient>): Promise<number | null> {
  const now = Date.now();
  const horizon = new Date(now + KICKOFF_HORIZON_MINUTES * 60_000).toISOString();
  const { data } = await supabase
    .from("fixture")
    .select("kickoff_at")
    .eq("status", "NS")
    .gte("kickoff_at", new Date(now).toISOString())
    .lte("kickoff_at", horizon)
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return Math.max(0, Math.round((new Date(data.kickoff_at).getTime() - now) / 60_000));
}

// `supabase`-param (steg 10): se pre-match-pipeline.ts / import-events.ts.
export async function runLiveTick(
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<LiveTickResult> {
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);
  const venueCache = createVenueCache(supabase);
  const refereeCache = createRefereeCache(supabase);

  let apiCalls = 0;
  let justFinished = 0;

  const { data: liveFixtures } = await apiFootballGet<ApiLiveFixtureResponse>("/fixtures", { live: "all" });
  apiCalls++;

  const allsvenskanLive = liveFixtures.filter((f) => f.league.id === ALLSVENSKAN_LEAGUE_EXTERNAL_ID);

  const closeOut = await closeOutStaleLiveFixtures(supabase, new Set(allsvenskanLive.map((f) => f.fixture.id)));
  apiCalls += closeOut.apiCalls;
  justFinished += closeOut.closed;

  if (allsvenskanLive.length === 0) {
    console.log(`Inga pågående Allsvenskan-matcher just nu (${liveFixtures.length} live totalt i andra ligor).`);
  } else {
    console.log(`${allsvenskanLive.length} pågående Allsvenskan-match(er).`);
  }

  for (const live of allsvenskanLive) {
    const { data: fixtureRow } = await supabase
      .from("fixture")
      .select("id, status, referee_id")
      .eq("external_id", live.fixture.id)
      .maybeSingle();
    if (!fixtureRow) {
      console.warn(`  ! Okänd match (external_id ${live.fixture.id}) — inte importerad i fixture-tabellen, hoppar över.`);
      continue;
    }

    const statusChanged = fixtureRow.status !== live.fixture.status.short;
    const phase = matchPhase(live.fixture.status.short);

    // Fas 20: ställningen skrivs nu till fixture-raden, inte bara till
    // snapshoten. Det är den raden matchlistan och alla lagvyer läser —
    // utan den visade en pågående match resultatet som "–".
    if (statusChanged || live.goals.home !== null || live.goals.away !== null) {
      const { error } = await supabase
        .from("fixture")
        .update({ status: live.fixture.status.short, home_score: live.goals.home, away_score: live.goals.away })
        .eq("id", fixtureRow.id);
      if (error) throw error;
    }

    // Domare/arena: bara vid en övergång, bara så länge de saknas.
    if (statusChanged && fixtureRow.referee_id === null && live.fixture.id) {
      apiCalls += await backfillFixtureMetadata(supabase, { id: fixtureRow.id, external_id: live.fixture.id }, { venue: venueCache, referee: refereeCache });
    }

    // Behöver den här matchen en färsk statistics-avläsning också, eller räcker score/minut?
    const { data: lastSnapshot } = await supabase
      .from("fixture_live_snapshots")
      .select("captured_at, home_possession_pct")
      .eq("fixture_id", fixtureRow.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const snapshotAgeMinutes = lastSnapshot ? (Date.now() - new Date(lastSnapshot.captured_at).getTime()) / 60000 : Infinity;
    // I paus (HT/BT) står spelet stilla — statistiken kan per definition
    // inte ändras, så där hämtas den bara i den tick då pausen börjar.
    const statsAllowed = phase === "live" || statusChanged;
    const needsStatsRefresh = statsAllowed && (snapshotAgeMinutes >= STATS_REFRESH_MINUTES || lastSnapshot?.home_possession_pct == null);

    const statsRow: Partial<Record<string, number | null>> = {};
    if (needsStatsRefresh) {
      const { data: teamStats } = await apiFootballGet<ApiFixtureStatisticsResponse>("/fixtures/statistics", { fixture: live.fixture.id });
      apiCalls++;
      for (const t of teamStats) {
        const isHome = t.team.id === live.teams.home.id;
        const poss = t.statistics.find((s) => s.type === "Ball Possession")?.value;
        const shots = t.statistics.find((s) => s.type === "Total Shots")?.value;
        const shotsOn = t.statistics.find((s) => s.type === "Shots on Goal")?.value;
        const corners = t.statistics.find((s) => s.type === "Corner Kicks")?.value;
        const prefix = isHome ? "home" : "away";
        statsRow[`${prefix}_possession_pct`] = poss ? Number(String(poss).replace("%", "")) : null;
        statsRow[`${prefix}_shots_total`] = typeof shots === "number" ? shots : null;
        statsRow[`${prefix}_shots_on_target`] = typeof shotsOn === "number" ? shotsOn : null;
        statsRow[`${prefix}_corners`] = typeof corners === "number" ? corners : null;
      }
    }

    const { error: snapshotError } = await supabase.from("fixture_live_snapshots").insert({
      fixture_id: fixtureRow.id,
      match_minute: live.fixture.status.elapsed,
      home_score: live.goals.home,
      away_score: live.goals.away,
      ...statsRow,
    });
    if (snapshotError) throw snapshotError;

    // Events: varje tick medan spelet rullar (billigt, ett anrop). I paus
    // bara i övergångsticken — inga händelser kan tillkomma medan bollen
    // ligger stilla, och halvtidspausen är 15 minuter lång.
    let eventNote = "";
    if (phase === "live" || statusChanged) {
      const { data: events } = await apiFootballGet<ApiEventResponse>("/fixtures/events", { fixture: live.fixture.id });
      apiCalls++;
      const rows = await buildEventRows(fixtureRow.id, events, {
        team: (t) => teamCache.ensure(t),
        player: (id) => playerCache.lookup(id),
      });
      const synced = await syncFixtureEvents(supabase, fixtureRow.id, rows);
      eventNote = ` — ${events.length} events${synced.removed > 0 ? ` (${synced.removed} skräprad borttagen)` : ""}`;
    }

    console.log(
      `  ✓ ${live.teams.home.name} ${live.goals.home}-${live.goals.away} ${live.teams.away.name} (${live.fixture.status.long}, min ${live.fixture.status.elapsed})${eventNote}${needsStatsRefresh ? ", statistik uppdaterad" : ""}`
    );
  }

  // Fas 21: Sportmonks-delen av samma tick — matchklocka (periods), löpande
  // kommentar (comments), full live-statistik (34 typer) och momentum
  // (trends/pressure). Körs EFTER API-Football-delen ovan, som redan satt
  // status/ställning, så de två källorna beskriver samma ögonblick.
  // Sportmonks är komplementet: går det fel här står grunddatan kvar.
  let sportmonks: Awaited<ReturnType<typeof runSportmonksLiveTick>> | null = null;
  if (allsvenskanLive.length > 0) {
    try {
      sportmonks = await runSportmonksLiveTick(supabase);
      if (sportmonks.missingTables) {
        console.warn(
          "  ! Matchhubbens tabeller saknas — kör migration 20260823120000_live_match_hub.sql. Live-flödet fungerar ändå, men utan klocka/kommentar/full statistik."
        );
      } else if (sportmonks.fixtures > 0) {
        console.log(`  ✓ Sportmonks: ${sportmonks.fixtures} match(er), ${sportmonks.comments} kommentarsrader, ${sportmonks.stats} statistikvärden.`);
      }
    } catch (err) {
      console.warn(`  ! Sportmonks live-tick misslyckades helt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fas 20: slutsignal → full post-match-import DIREKT. Samma fyra steg som
  // finalize-cronen kör kl 03:00, men nu medan matchen fortfarande är
  // intressant. Stegen filtrerar själva på "avslutad + inte redan synkad",
  // så det här är ett no-op när ingen match precis tagit slut — därav
  // villkoret: kör bara när vi FAKTISKT såg en övergång i den här ticken.
  if (justFinished > 0) {
    console.log(`\n${justFinished} match(er) slutsignalerade — kör full post-match-import direkt istället för att vänta på nattens cron.`);
    await runPostMatchImports(supabase);
  }

  const nextKickoff = await minutesToNextKickoff(supabase);
  return {
    inPlay: allsvenskanLive.length,
    minutesToNextKickoff: nextKickoff,
    justFinished,
    // Sportmonks har en EGEN kvot (2000/timme per entitet) och blandas
    // medvetet inte in i API-Footballs anropsräknare — de mäter olika tak.
    apiCalls,
    sportmonksCalls: sportmonks?.apiCalls ?? 0,
  };
}
