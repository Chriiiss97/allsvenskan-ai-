import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiInjuryResponse, ApiLineupResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";
import { createPlayerCache } from "./player-cache";
import { IN_PLAY_STATUSES } from "../../lib/football/live-status";

/**
 * Steg 5 — pre-match pipeline. Till skillnad från steg 3–4 (engångs-
 * bakåtfyllnad) är det här tänkt att köras UPPREPAT över tid — cron/Vercel
 * Cron/liknande, som inte finns konfigurerat i projektet än (ingen
 * vercel.json, ingen deploy-infrastruktur). Den här filen bygger och
 * verifierar SJÄLVA LOGIKEN; SCHEMALÄGGNINGEN är ett separat beslut.
 *
 * Två jobb, olika frekvens (tänkt, inte hårdkodat här — anropande kod
 * avgör hur ofta):
 *   1. Skador: /injuries per lag som spelar inom INJURY_WINDOW_HOURS.
 *      Billigt (1 anrop/lag), tänkt att köras några gånger/dygn.
 *   2. Laguppställning: /fixtures/lineups bara för matcher inom
 *      LINEUP_WINDOW_MINUTES från avspark OCH som inte redan har en
 *      sparad lineup — undviker att polla i onödan efter att den redan
 *      är bekräftad (samma princip som planen krävde).
 *
 * Medvetet UTANFÖR den här pipelinen: /sidelined (datumintervall-historik
 * per SPELARE, inte lag — att hämta det för varje spelare i varje lag som
 * spelar snart hade kostat ~25 anrop/lag istället för 1, och är en
 * biografidetalj, inte en färskhetskänslig pre-match-signal). Kan byggas
 * som en egen, mycket glesare körning senare om det blir efterfrågat.
 */
const INJURY_WINDOW_HOURS = 48;
const LINEUP_WINDOW_MINUTES = 120;
/**
 * Fas 20: hur långt EFTER avspark vi fortfarande försöker hämta en
 * laguppställning som saknas. Täcker en hel match med god marginal — en
 * uppställning som publiceras sent (eller en körning som missades) ska inte
 * betyda att matchvyn står utan startelva ända tills nattens finalize.
 */
const LINEUP_CATCHUP_MINUTES = 210;

interface UpcomingFixture {
  id: number;
  external_id: number | null;
  kickoff_at: string;
  lineups_synced_at: string | null;
  home_team: { external_id: number | null; name: string } | null;
  away_team: { external_id: number | null; name: string } | null;
}

// `supabase`-param (steg 10): se import-events.ts — låter app/api/cron/pre-match
// skicka in en app-säker klient (lib/supabase/admin.ts) istället för scriptets egen.
export async function runPreMatchPipeline(supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  const teamCache = createTeamCache(supabase);
  const playerCache = createPlayerCache(supabase);
  const now = new Date();
  const injuryWindowEnd = new Date(now.getTime() + INJURY_WINDOW_HOURS * 60 * 60 * 1000);

  const { data: upcoming, error } = await supabase
    .from("fixture")
    .select(
      "id, external_id, kickoff_at, lineups_synced_at, home_team:home_team_id(external_id, name), away_team:away_team_id(external_id, name)"
    )
    .eq("status", "NS")
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", injuryWindowEnd.toISOString())
    .order("kickoff_at", { ascending: true })
    .returns<UpcomingFixture[]>();
  if (error) throw error;

  console.log(`${upcoming?.length ?? 0} kommande matcher inom ${INJURY_WINDOW_HOURS}h.`);

  // ---------------------------------------------------------------------
  // 1) Skador — ett anrop per lag som spelar inom fönstret, deduplicerat
  // ---------------------------------------------------------------------
  const fixtureExternalIdSet = new Set((upcoming ?? []).map((f) => f.external_id).filter((id): id is number => id !== null));
  const teamsInvolved = new Map<number, { externalId: number; name: string }>();
  for (const f of upcoming ?? []) {
    if (f.home_team?.external_id) teamsInvolved.set(f.home_team.external_id, { externalId: f.home_team.external_id, name: f.home_team.name });
    if (f.away_team?.external_id) teamsInvolved.set(f.away_team.external_id, { externalId: f.away_team.external_id, name: f.away_team.name });
  }

  console.log(`\nHämtar skadestatus för ${teamsInvolved.size} lag...`);
  let injuryRows = 0;
  for (const team of teamsInvolved.values()) {
    const { data: injuries } = await apiFootballGet<ApiInjuryResponse>("/injuries", {
      team: team.externalId,
      season: now.getUTCFullYear(),
    });

    for (const inj of injuries) {
      // Bara statusrapporter som gäller EN AV VÅRA kommande matcher i fönstret
      // — /injuries kan ge historiska rapporter för matcher som redan spelats.
      if (!fixtureExternalIdSet.has(inj.fixture.id)) continue;

      const playerId = await playerCache.lookup(inj.player.id);
      if (!playerId) continue;
      const fixture = (upcoming ?? []).find((f) => f.external_id === inj.fixture.id);
      if (!fixture) continue;

      // player_injury har medvetet ingen unique constraint (kind='sidelined'
      // vs 'matchstatus' har olika naturliga nycklar, se migrationen) — slå
      // upp och uppdatera/infoga manuellt istället för upsert+onConflict,
      // samma mönster som team-cache.ts redan använder för samma anledning.
      const { data: existing } = await supabase
        .from("player_injury")
        .select("id")
        .eq("player_id", playerId)
        .eq("fixture_id", fixture.id)
        .eq("kind", "matchstatus")
        .maybeSingle();

      const payload = { player_id: playerId, kind: "matchstatus" as const, type: inj.player.type, reason: inj.player.reason, fixture_id: fixture.id };
      const { error: injError } = existing
        ? await supabase.from("player_injury").update(payload).eq("id", existing.id)
        : await supabase.from("player_injury").insert(payload);
      if (injError) throw injError;
      injuryRows++;
    }
    console.log(`  ✓ ${team.name}: ${injuries.length} statusrapporter hämtade`);
  }
  console.log(`Sparade/uppdaterade ${injuryRows} skaderader kopplade till kommande matcher.`);

  // ---------------------------------------------------------------------
  // 2) Laguppställning — bara nära avspark, bara om vi inte redan har den
  // ---------------------------------------------------------------------
  // Fas 20 (2026-08-23): egen fråga istället för en filtrering av `upcoming`
  // ovan, av två skäl som båda visade sig i skarp drift.
  //
  //  1. `upcoming` kräver `status = 'NS'` OCH `kickoff_at >= now`. Så fort
  //     avsparken passerat föll matchen ur listan och laguppställningen
  //     hämtades ALDRIG mer — förrän nattens finalize-körning. Med en
  //     schemaläggare som i praktiken vaknar var 22:a minut (mätt) var det
  //     ren tur att hinna med fönstret: 2026-08-22 räddades matchen av en
  //     körning som startade 12:59:50 inför en avspark 13:00.
  //  2. En match kan ha startat utan att laguppställningen publicerats än.
  //
  // Nu tas alltså matcher UTAN sparad lineup som antingen startar snart
  // eller redan har startat (men inte är slutspelade). `lineups_synced_at`
  // sätts bara när API:t faktiskt gav en uppställning, så en match som ännu
  // inte publicerat sin plockas upp igen nästa körning — oförändrat.
  const lineupWindowStart = new Date(now.getTime() - LINEUP_CATCHUP_MINUTES * 60_000).toISOString();
  const lineupWindowEnd = new Date(now.getTime() + LINEUP_WINDOW_MINUTES * 60_000).toISOString();
  const { data: dueForLineupRaw, error: lineupQueryError } = await supabase
    .from("fixture")
    .select(
      "id, external_id, kickoff_at, lineups_synced_at, home_team:home_team_id(external_id, name), away_team:away_team_id(external_id, name)"
    )
    .is("lineups_synced_at", null)
    .in("status", ["NS", ...IN_PLAY_STATUSES])
    .gte("kickoff_at", lineupWindowStart)
    .lte("kickoff_at", lineupWindowEnd)
    .order("kickoff_at", { ascending: true })
    .returns<UpcomingFixture[]>();
  if (lineupQueryError) throw lineupQueryError;
  const dueForLineup = dueForLineupRaw ?? [];

  console.log(`\n${dueForLineup.length} matcher inom lineup-fönstret (−${LINEUP_CATCHUP_MINUTES}/+${LINEUP_WINDOW_MINUTES} min från avspark) utan sparad lineup.`);
  for (const fixture of dueForLineup) {
    if (!fixture.external_id) continue;
    const { data: lineups } = await apiFootballGet<ApiLineupResponse>("/fixtures/lineups", { fixture: fixture.external_id });

    if (lineups.length === 0) {
      console.log(`  … ${fixture.home_team?.name} vs ${fixture.away_team?.name}: ej publicerad än, försök igen senare.`);
      continue; // INGET sync-flagg satt — nästa körning försöker igen
    }

    for (const l of lineups) {
      const teamId = await teamCache.ensure(l.team);
      let coachId: number | null = null;
      if (l.coach) {
        const { data: coachRow } = await supabase.from("coach").select("id").eq("external_id", l.coach.id).maybeSingle();
        coachId = coachRow?.id ?? null;
      }
      const { data: lineupRow, error: lineupError } = await supabase
        .from("fixture_lineup")
        .upsert({ fixture_id: fixture.id, team_id: teamId, coach_id: coachId, formation: l.formation }, { onConflict: "fixture_id,team_id" })
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
    console.log(`  ✓ ${fixture.home_team?.name} vs ${fixture.away_team?.name}: laguppställning sparad.`);
  }
}
