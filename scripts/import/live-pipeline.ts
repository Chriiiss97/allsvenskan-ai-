import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiLiveFixtureResponse, ApiFixtureStatisticsResponse, ApiEventResponse, ApiFixtureResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID } from "./config";
import { LIVE_FIXTURE_STATUSES } from "../../lib/football/tools";

/**
 * Steg 6 — live-match pipeline. Precis som steg 5 är det här EN
 * pollningsomgång (en "tick"), inte en process som håller sig själv igång —
 * en extern schemaläggare (cron/Vercel Cron/en egen alltid-igång-process)
 * ska anropa den här funktionen upprepat under ett matchfönster (planens
 * ~45–60s). Ingen sådan schemaläggning finns i projektet än, samma
 * medvetna avgränsning som steg 5.
 *
 * Nyckelinsikten från steg 1: /fixtures?live=all ger ALLA just nu pågående
 * matcher globalt i ETT anrop — filtreras här ner till bara Allsvenskan.
 * Det anropet ger status/minut/resultat men INTE possession/skott/hörnor
 * (det kräver /fixtures/statistics per match) — så varje tick gör den
 * billiga live=all-koll för alla matcher, men den dyrare statistics-frågan
 * bara om senaste sparade snapshot för matchen är >3 min gammal (eller
 * saknas), inte varje tick. Ingen extern schemaläggare behöver känna till
 * skillnaden — scriptet avgör det självt från vad som redan är sparat.
 *
 * OBS: kunde inte testas mot en riktig pågående Allsvenskan-match (ingen
 * var live vid byggtillfället — nästa avspark är 2026-08-21). Mekaniken
 * (live=all, fixtures/statistics, fixtures/events mot en INTE-ännu-FT
 * match) är verifierad mot en match i en annan liga; Allsvenskan-specifikt
 * beteende återstår att bekräfta under ett riktigt matchfönster.
 */
const STATS_REFRESH_MINUTES = 3;

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
) {
  const { data: candidates, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .in("status", LIVE_FIXTURE_STATUSES);
  if (error) throw error;

  for (const c of candidates ?? []) {
    if (!c.external_id || currentlyLiveExternalIds.has(c.external_id)) continue;

    const { data: real } = await apiFootballGet<ApiFixtureResponse>("/fixtures", { id: c.external_id });
    const match = real[0];
    if (!match || match.fixture.status.short === c.status) continue;

    const { error: updateError } = await supabase
      .from("fixture")
      .update({ status: match.fixture.status.short, home_score: match.goals.home, away_score: match.goals.away })
      .eq("id", c.id);
    if (updateError) throw updateError;
    console.log(
      `  ⟳ Match ${c.id} (external_id ${c.external_id}) hade lämnat live-flödet — status rättad ${c.status} → ${match.fixture.status.short} (${match.goals.home}-${match.goals.away}).`
    );
  }
}

// `supabase`-param (steg 10): se pre-match-pipeline.ts / import-events.ts.
export async function runLiveTick(supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);

  const { data: liveFixtures } = await apiFootballGet<ApiLiveFixtureResponse>("/fixtures", { live: "all" });

  const allsvenskanLive = liveFixtures.filter((f) => f.league.id === ALLSVENSKAN_LEAGUE_EXTERNAL_ID);

  await closeOutStaleLiveFixtures(supabase, new Set(allsvenskanLive.map((f) => f.fixture.id)));

  if (allsvenskanLive.length === 0) {
    console.log(`Inga pågående Allsvenskan-matcher just nu (${liveFixtures.length} live totalt i andra ligor).`);
    return;
  }
  console.log(`${allsvenskanLive.length} pågående Allsvenskan-match(er).`);

  for (const live of allsvenskanLive) {
    const { data: fixtureRow } = await supabase
      .from("fixture")
      .select("id, status")
      .eq("external_id", live.fixture.id)
      .maybeSingle();
    if (!fixtureRow) {
      console.warn(`  ! Okänd match (external_id ${live.fixture.id}) — inte importerad i fixture-tabellen, hoppar över.`);
      continue;
    }

    // Statusövergång (NS -> 1H/2H/HT osv.) — samma fält som post-match redan uppdaterar.
    if (fixtureRow.status !== live.fixture.status.short) {
      await supabase.from("fixture").update({ status: live.fixture.status.short }).eq("id", fixtureRow.id);
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
    const needsStatsRefresh = snapshotAgeMinutes >= STATS_REFRESH_MINUTES || lastSnapshot?.home_possession_pct == null;

    const statsRow: Partial<Record<string, number | null>> = {};
    if (needsStatsRefresh) {
      const { data: teamStats } = await apiFootballGet<ApiFixtureStatisticsResponse>("/fixtures/statistics", { fixture: live.fixture.id });
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

    // Events: hämtas varje tick (billigt, ett anrop) sålänge matchen pågår —
    // samma upsert-logik som import-events.ts, men mot en match som INTE är
    // FT än (import-events.ts filtrerar bort sådana med sitt statusfilter).
    const { data: events } = await apiFootballGet<ApiEventResponse>("/fixtures/events", { fixture: live.fixture.id });
    for (const e of events) {
      const teamId = await teamCache.ensure(e.team);
      const playerId = await playerCache.lookup(e.player.id);
      const assistPlayerId = await playerCache.lookup(e.assist.id);
      const { error: eventError } = await supabase.from("event").upsert(
        {
          fixture_id: fixtureRow.id,
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

    console.log(
      `  ✓ ${live.teams.home.name} ${live.goals.home}-${live.goals.away} ${live.teams.away.name} (${live.fixture.status.long}, min ${live.fixture.status.elapsed}) — ${events.length} events${needsStatsRefresh ? ", statistik uppdaterad" : ""}`
    );
  }
}
