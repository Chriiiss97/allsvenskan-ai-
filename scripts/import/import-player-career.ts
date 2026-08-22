import { apiFootballGet } from "../../lib/api-football/client";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID } from "./config";

/**
 * Fas 17 (2026-08-22) — spelarens FULLA dokumenterade karriär (inte bara
 * Allsvenskan) + troféer. Byggd efter ett riktigt testanrop mot
 * api-football (denna sessions research):
 *
 *   1. /transfers?player=X          → riktiga klubbyten, datum, typ
 *                                      (Free/Loan/€-summa), inkl. utländska
 *                                      klubbar.
 *   2. /players?id=X&team=T&season=Y → riktig per-klubb-per-säsong-statistik
 *                                      (matcher/mål/assist/minuter/kort/
 *                                      betyg) för VILKEN liga som helst.
 *   3. /trophies?player=X            → riktig trofédata.
 *
 * Från transfers deriveras vilka (lag, år)-par som är värda att slå upp i
 * (2) — ett transfer-fönster [ankomstdatum, nästa avgångsdatum eller idag]
 * expanderas till varje helår i intervallet. Ett år utan statistik-svar
 * (spelaren satt på bänken/inte registrerad den ligan) ger bara inga rader
 * — ALDRIG en påhittad 0-rad.
 *
 * Allsvenskan (league_external_id=113) skrivs INTE till
 * player_career_stint — den täcks redan, mer exakt, av `statistics`-
 * tabellen (steg 3/4:s etablerade källa), som förblir orörd. Den här
 * tabellen fyller bara i det statistics INTE har: utländska ligor, lägre
 * svenska divisioner, cupspel.
 *
 * Resumable: player.career_synced_at är avstämningsflaggan (samma mönster
 * som fixture.sportmonks_match_facts_synced_at) — en avbruten körning kan
 * återupptas utan att börja om, och maxPlayersPerRun begränsar hur många
 * spelare EN körning tar (api-football Ultra: 75000 anrop/dygn, men en
 * spelare med många klubbyten kan kosta 10-15 anrop — vill inte binda hela
 * dygnskvoten på en enda körning).
 */

const DEFAULT_MAX_PLAYERS_PER_RUN = 120;
const MAX_YEARS_PER_STINT = 8; // skydd mot orimligt långa/felaktiga transfer-intervall

interface ApiTransferEntry {
  date: string;
  type: string | null;
  teams: {
    in: { id: number; name: string; logo: string } | null;
    out: { id: number; name: string; logo: string } | null;
  };
}

interface ApiTransfersResponse {
  player: { id: number; name: string };
  update: string;
  transfers: ApiTransferEntry[];
}

interface ApiPlayerStatsEntry {
  team: { id: number; name: string; logo: string };
  league: { id: number; name: string; country: string; logo: string; season: number };
  games: { appearences: number | null; lineups: number | null; minutes: number | null; rating: string | null };
  goals: { total: number | null; assists: number | null };
  cards: { yellow: number | null; red: number | null };
}

interface ApiPlayerWithStats {
  player: { id: number; name: string };
  statistics: ApiPlayerStatsEntry[];
}

interface ApiTrophyEntry {
  league: string;
  country: string | null;
  season: string;
  place: string;
}

/** Expanderar ett [start,slut]-transferfönster till en lista helår — ALDRIG fler än MAX_YEARS_PER_STINT (skydd mot en felformad/orimlig datumrad). */
function yearsInWindow(startDate: Date, endDate: Date): number[] {
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear && years.length < MAX_YEARS_PER_STINT; y++) years.push(y);
  return years;
}

/** Klubbyten → kandidat-(lag,år)-par att slå upp statistik för. Transfers kommer NYAST FÖRST från api-football. */
function deriveTeamYearCandidates(transfers: ApiTransferEntry[]): { teamId: number; teamName: string; year: number }[] {
  const sorted = [...transfers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const candidates: { teamId: number; teamName: string; year: number }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (!t.teams.in) continue;
    const start = new Date(t.date);
    if (Number.isNaN(start.getTime())) continue;
    const next = sorted[i + 1];
    const end = next ? new Date(next.date) : new Date(); // sista klubben: fram till idag
    for (const year of yearsInWindow(start, end)) {
      const key = `${t.teams.in.id}:${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ teamId: t.teams.in.id, teamName: t.teams.in.name, year });
    }
  }
  return candidates;
}

export async function importPlayerCareer(maxPlayersPerRun = DEFAULT_MAX_PLAYERS_PER_RUN, onlyPlayerIds?: number[]) {
  const supabase = createAdminClient();

  // onlyPlayerIds: riktad körning mot NAMNGIVNA spelare (t.ex. en spelare
  // användaren pekat ut) — kör OM även om career_synced_at redan är satt
  // (en tidigare körning kan ha missat spelaren, t.ex. pga ett klubbyte
  // som hänt EFTER förra körningen), hoppar över tak/prioritetsordningen
  // som annars styr batch-körningen.
  let query = supabase.from("player").select("id, external_id, full_name, current_team_id");
  if (onlyPlayerIds && onlyPlayerIds.length > 0) {
    query = query.in("id", onlyPlayerIds);
  } else {
    query = query
      .is("career_synced_at", null)
      .not("external_id", "is", null)
      // Spelare i en aktuell trupp (current_team_id satt) prioriteras — de är
      // rimligast de mest visade profilerna. Resten fylls i över flera körningar.
      .order("current_team_id", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(maxPlayersPerRun);
  }
  const { data: players, error } = await query;
  if (error) throw error;
  if (!players || players.length === 0) {
    console.log("Inga spelare kvar utan career_synced_at.");
    return;
  }
  console.log(`Hämtar karriärhistorik för ${players.length} spelare (tak: ${maxPlayersPerRun}/körning)...`);

  let stintRows = 0;
  let trophyRows = 0;
  let playersDone = 0;
  let playersFailed = 0;

  for (const player of players) {
    try {
      const { data: transfersResp } = await apiFootballGet<ApiTransfersResponse>("/transfers", { player: player.external_id! });
      const transfers = transfersResp[0]?.transfers ?? [];
      const candidates = deriveTeamYearCandidates(transfers);

      // Fas 18 — SPARA VARJE övergångshändelse (inte bara den senaste), så
      // karriärresans "Lämnade Allsvenskan"-milstolpe kan visa RÄTT
      // övergångstyp/-summa för just det steget, inte bara det allra
      // senaste klubbytet.
      for (const t of transfers) {
        if (!t.teams.in || Number.isNaN(new Date(t.date).getTime())) continue;
        const { error: transferEventError } = await supabase.from("player_transfer_event").upsert(
          {
            player_id: player.id,
            transfer_date: t.date,
            from_team_name: t.teams.out?.name ?? null,
            from_team_external_id: t.teams.out?.id ?? null,
            from_team_logo_url: t.teams.out?.logo ?? null,
            to_team_name: t.teams.in.name,
            to_team_external_id: t.teams.in.id,
            to_team_logo_url: t.teams.in.logo ?? null,
            transfer_type: t.type ?? null,
          },
          { onConflict: "player_id,transfer_date,to_team_external_id" }
        );
        if (transferEventError) throw transferEventError;
      }

      for (const c of candidates) {
        const { data: statsResp } = await apiFootballGet<ApiPlayerWithStats>("/players", {
          id: player.external_id!,
          team: c.teamId,
          season: c.year,
        });
        const entries = statsResp[0]?.statistics ?? [];
        for (const entry of entries) {
          if (entry.league.id === ALLSVENSKAN_LEAGUE_EXTERNAL_ID) continue; // redan täckt av statistics-tabellen
          // Vissa entries (t.ex. "Club Friendlies") saknar liga-id eller
          // säsong hos api-football — hoppar över istället för att skriva
          // en rad med ett NOT NULL-fält satt till null (skulle bara
          // krascha insert, se verkligt fall: A. Isak/Club Friendlies 2017).
          if (entry.league.id == null || entry.league.season == null) continue;
          // "Friendlies"/"Club Friendlies" är inte tävlingsmatcher — de
          // förvirrar snarare karriärresan (fel "land" på en klubbperiod,
          // se career-journey.ts:s normaliseringskommentar) än de
          // tillför verklig karriärinformation.
          if (/friendl/i.test(entry.league.name)) continue;
          const rating = entry.games.rating != null ? Number(entry.games.rating) : null;
          const { error: insertError } = await supabase.from("player_career_stint").upsert(
            {
              player_id: player.id,
              team_name: entry.team.name,
              team_logo_url: entry.team.logo ?? null,
              team_external_id: entry.team.id,
              league_name: entry.league.name,
              league_country: entry.league.country ?? null,
              league_logo_url: entry.league.logo ?? null,
              league_external_id: entry.league.id,
              season_year: entry.league.season,
              appearances: entry.games.appearences,
              lineups: entry.games.lineups,
              minutes_played: entry.games.minutes,
              goals: entry.goals.total,
              assists: entry.goals.assists,
              yellow_cards: entry.cards.yellow,
              red_cards: entry.cards.red,
              rating: rating != null && !Number.isNaN(rating) ? rating : null,
            },
            { onConflict: "player_id,team_external_id,league_external_id,season_year" }
          );
          if (insertError) throw insertError;
          stintRows++;
        }
      }

      const { data: trophiesResp } = await apiFootballGet<ApiTrophyEntry>("/trophies", { player: player.external_id! });
      for (const trophy of trophiesResp) {
        if (trophy.season == null) continue; // api-football saknar ibland säsong på en trofé-rad — hoppar över, gissar aldrig ett år
        const { error: trophyError } = await supabase.from("player_trophy").upsert(
          {
            player_id: player.id,
            league_name: trophy.league,
            country: trophy.country ?? null,
            season: trophy.season,
            place: trophy.place,
          },
          { onConflict: "player_id,league_name,season,place" }
        );
        if (trophyError) throw trophyError;
        trophyRows++;
      }

      // Senaste klubbytet (oavsett Allsvenskan eller ej) — "gratis" ur samma
      // /transfers-svar redan hämtat ovan. UI:t jämför mot current_team_id
      // för att flagga "har lämnat", se migrationens kommentar.
      const latestTransfer = [...transfers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const latestTransferFields =
        latestTransfer?.teams.in && !Number.isNaN(new Date(latestTransfer.date).getTime())
          ? {
              latest_transfer_date: latestTransfer.date,
              latest_transfer_team_name: latestTransfer.teams.in.name,
              latest_transfer_team_logo_url: latestTransfer.teams.in.logo ?? null,
              latest_transfer_team_external_id: latestTransfer.teams.in.id,
              latest_transfer_type: latestTransfer.type ?? null,
            }
          : {};

      await supabase
        .from("player")
        .update({ career_synced_at: new Date().toISOString(), ...latestTransferFields })
        .eq("id", player.id);
      playersDone++;
      console.log(`  ✓ ${player.full_name}: ${candidates.length} klubb/år-kandidater, ${trophiesResp.length} troféer`);
    } catch (err) {
      playersFailed++;
      // Supabase-fel (PostgrestError) är vanliga objekt, inte Error-
      // instanser — String(err) gav tidigare bara "[object Object]",
      // JSON.stringify visar den verkliga orsaken (t.ex. unique-krock).
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.warn(`  ⚠ ${player.full_name} (id=${player.id}) misslyckades, hoppar över: ${message}`);
      // INGEN career_synced_at satt — tas upp igen nästa körning.
    }
  }

  console.log(`\nKlart: ${playersDone} spelare klara, ${playersFailed} misslyckade, ${stintRows} karriärrader, ${trophyRows} trofé-rader.`);
}
