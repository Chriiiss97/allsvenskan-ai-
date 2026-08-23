import { createAdminClient } from "./admin-client";
import { sportmonksGet } from "../../lib/sportmonks/client";
import { getLeagueTierByName } from "../../lib/football/league-tier-by-name";
import { SPORTMONKS_TIER1_SENTINEL_LEAGUE_ID, SPORTMONKS_TIER2_SENTINEL_LEAGUE_ID } from "../../lib/football/league-tier";

/**
 * Fas 18m (2026-08-23, "kolla med Sportmonks med") — FALLBACK-import för
 * spelare där api-football-importen (import-player-career.ts) misslyckats
 * eller ännu inte hunnits med, men som VI REDAN har en godkänd
 * `sportmonks_id`-mappning för (~30 % av spelarna, se research-underlaget:
 * bara 700/2305 spelare har en Sportmonks-mappning alls, mot api-footballs
 * nästan fullständiga täckning — därför en fallback, ALDRIG huvudkälla).
 *
 * SKILLNADER MOT import-player-career.ts (medvetna, för säkerhets skull —
 * skrivet utan möjlighet till direkt användargranskning samma kväll):
 *
 * 1. INGEN transfer-/statusdata skrivs (player.latest_transfer_*,
 *    player_transfer_event). Sportmonks lag-ID:n är en HELT ANNAN,
 *    inkompatibel ID-rymd än api-footballs — att skriva ett Sportmonks-ID
 *    in i `latest_transfer_team_external_id` (som post-allsvenskan.ts
 *    matchar mot api-footballs Allsvenska lag-ID:n) hade riskerat att en
 *    slumpmässig ID-krock fick en spelare att se ut som "tillbaka i
 *    Allsvenskan" hos fel klubb. Spelare som bara synkats via den här
 *    fallbacken får därför status "unknown" i Efter Allsvenskan — ärligt
 *    (vi vet inte var de är NU) hellre än en gissning.
 * 2. INGA troféer importeras (kräver mer research för att bli lika
 *    tillförlitligt som api-football-varianten — se svaret i chatten
 *    2026-08-23).
 * 3. Tier 1/2-klassificeringen görs på (LAND, LIGANAMN) — se
 *    league-tier-by-name.ts — eftersom Sportmonks liga-ID:n inte matchar
 *    league-tier.ts:s api-football-ID:n. En rad som inte matchar en känd
 *    tier 1/2-liga skrivs INTE (ingen okvalificerad brus-data).
 * 4. `team_external_id`/`league_external_id` sätts INTE till Sportmonks
 *    egna ID:n rakt av (samma krock-risk som punkt 1) — istället:
 *    - team_external_id = NEGATIVA Sportmonks-lag-ID:t (aldrig positivt,
 *      kan alltså aldrig krocka med ett äkta api-football-ID, men ger
 *      ändå en stabil, unik nyckel per klubb för upsert-idempotens).
 *    - league_external_id = en av de två syntetiska tier-sentinelvärdena
 *      (league-tier.ts) — gör att den BEFINTLIGA, OFÖRÄNDRADE
 *      kvalificeringsspärren i post-allsvenskan.ts automatiskt känner
 *      igen raden som redan verifierad tier 1/2, utan att den filen
 *      (som en annan session aktivt jobbar i) behöver röras alls.
 *
 * Resumable på samma sätt som import-player-career.ts: `career_synced_at`
 * sätts när spelaren är klar (ÄVEN om inga kvalificerande rader hittades —
 * ett kontrollerat "inget att hämta" är fortfarande ett avklarat försök),
 * men INTE vid ett kastat fel (nätverk/API) — då tas spelaren upp igen
 * nästa körning.
 */

const DEFAULT_MAX_PLAYERS_PER_RUN = 300;

interface SmType {
  id: number;
  name: string;
  code: string;
}
interface SmDetail {
  type_id: number;
  type?: SmType;
  value: Record<string, number | string>;
}
interface SmTeam {
  id: number;
  name: string;
  image_path: string | null;
  placeholder?: boolean;
  country?: { id: number; name: string } | null;
}
interface SmLeague {
  id: number;
  name: string;
}
interface SmSeason {
  id: number;
  name: string; // t.ex. "2024" eller "2023/2024"
  league?: SmLeague | null;
  league_id: number;
}
interface SmStatistic {
  id: number;
  team_id: number;
  season_id: number;
  team?: SmTeam | null;
  season?: SmSeason | null;
  details?: SmDetail[];
}
interface SmPlayer {
  id: number;
  statistics?: SmStatistic[];
}

/** Första 4-siffriga året i en säsongssträng ("2023/2024" -> 2023, "2024" -> 2024). Samma princip som trophySeasonYears i post-allsvenskan.ts. */
function firstYear(seasonName: string): number | null {
  const m = seasonName.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function statValue(details: SmDetail[], code: string, field = "total"): number | null {
  const d = details.find((x) => x.type?.code === code);
  if (!d) return null;
  const v = d.value?.[field];
  return typeof v === "number" ? v : null;
}

export async function importPlayerCareerSportmonks(maxPlayersPerRun = DEFAULT_MAX_PLAYERS_PER_RUN) {
  const supabase = createAdminClient();

  const { data: players, error } = await supabase
    .from("player")
    .select("id, sportmonks_id, full_name")
    .is("career_synced_at", null)
    .not("sportmonks_id", "is", null)
    .order("current_team_id", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(maxPlayersPerRun);
  if (error) throw error;
  if (!players || players.length === 0) {
    console.log("Inga osynkade spelare med sportmonks_id kvar.");
    return;
  }
  console.log(`[sportmonks-fallback] Hämtar karriärhistorik för ${players.length} spelare (tak: ${maxPlayersPerRun}/körning)...`);

  let playersDone = 0;
  let playersFailed = 0;
  let stintRows = 0;
  let skippedNonQualifying = 0;

  for (const player of players) {
    try {
      const include = "statistics.season.league;statistics.team.country;statistics.details.type";
      const res = await sportmonksGet<SmPlayer>(`football/players/${player.sportmonks_id}`, { include });
      const statistics = res.data.statistics ?? [];

      let wroteAny = false;
      for (const stat of statistics) {
        const team = stat.team;
        const season = stat.season;
        const league = season?.league;
        const details = stat.details ?? [];
        if (!team || !season || !league || team.placeholder) continue;

        const countryName = team.country?.name ?? null;
        if ((countryName ?? "").trim().toLowerCase() === "sweden") continue; // täcks redan av import-player-career.ts / `statistics`-tabellen

        const tier = getLeagueTierByName(countryName, league.name);
        if (tier === null) {
          skippedNonQualifying++;
          continue; // ingen känd tier 1/2-liga — ingen okvalificerad brus-rad skrivs
        }

        const seasonYear = firstYear(season.name);
        if (seasonYear === null) continue; // kan inte placera raden i tid — hellre utelämna än gissa

        const row = {
          player_id: player.id,
          team_name: team.name,
          team_logo_url: team.image_path,
          team_external_id: -team.id, // negativt = Sportmonks-namnrymd, kan aldrig krocka med ett äkta api-football-ID
          league_name: league.name,
          league_country: countryName,
          league_external_id: tier === 1 ? SPORTMONKS_TIER1_SENTINEL_LEAGUE_ID : SPORTMONKS_TIER2_SENTINEL_LEAGUE_ID,
          season_year: seasonYear,
          appearances: statValue(details, "appearances"),
          minutes_played: statValue(details, "minutes-played"),
          goals: statValue(details, "goals"),
          assists: statValue(details, "assists"),
          yellow_cards: statValue(details, "yellowcards"),
          red_cards: statValue(details, "redcards"),
          rating: statValue(details, "rating", "average"),
        };

        const { error: insertError } = await supabase
          .from("player_career_stint")
          .upsert(row, { onConflict: "player_id,team_external_id,league_external_id,season_year" });
        if (insertError) {
          console.warn(`  ⚠ ${player.full_name}: kunde inte skriva stint-rad (${team.name}/${season.name}): ${insertError.message}`);
          continue;
        }
        stintRows++;
        wroteAny = true;
      }

      await supabase.from("player").update({ career_synced_at: new Date().toISOString() }).eq("id", player.id);
      playersDone++;
      console.log(`  ✓ ${player.full_name}${wroteAny ? "" : " (inga tier 1/2-kvalificerande rader hittade)"}`);
    } catch (err) {
      playersFailed++;
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.warn(`  ⚠ ${player.full_name} (sportmonks_id=${player.sportmonks_id}) misslyckades, hoppar över: ${message}`);
      // INGEN career_synced_at satt — tas upp igen nästa körning.
    }
  }

  console.log(
    `\n[sportmonks-fallback] Klart: ${playersDone} spelare klara, ${playersFailed} misslyckade, ${stintRows} karriärrader skrivna, ${skippedNonQualifying} icke-kvalificerande rader hoppade över.`
  );
}
