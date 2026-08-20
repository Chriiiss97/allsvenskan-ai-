import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiTeamResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS } from "./config";

/**
 * Importerar ALLA Allsvenskan-lag + deras arenor via /teams?league=&season=
 * (ETT anrop per säsong ger hela ligans lag i ett svep, komplett med
 * venue.capacity/address/surface redan inbäddat — ingen separat
 * /venues-runda behövs, bekräftat i steg 3:s verifiering). Självförsörjande:
 * behöver INTE en förkänd lista av lag-ID:n, till skillnad från
 * IMPORT_TEAMS (som fortfarande används av import-players.ts/
 * import-fixtures.ts för att veta VILKA lags spelare/matcher som ska
 * hämtas i sina egna, per-lag-scopade anrop).
 *
 * Körs en gång per säsong i IMPORT_SEASONS (stigande år), så den senaste
 * säsongens data (t.ex. ett bytt arenanamn) vinner vid dubbletter — samma
 * "senaste vinner"-princip som redan används i import-players.ts för
 * current_team_id.
 */
export async function importTeams() {
  const supabase = createAdminClient();

  for (const year of IMPORT_SEASONS) {
    console.log(`Hämtar lag + arenor: Allsvenskan ${year}...`);
    const { data } = await apiFootballGet<ApiTeamResponse>("/teams", {
      league: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
      season: year,
    });

    for (const teamData of data) {
      let venueId: number | null = null;
      if (teamData.venue.id) {
        const { data: venueRow, error: venueError } = await supabase
          .from("venue")
          .upsert(
            {
              external_id: teamData.venue.id,
              name: teamData.venue.name ?? "Okänd arena",
              address: teamData.venue.address,
              city: teamData.venue.city,
              capacity: teamData.venue.capacity,
              surface: teamData.venue.surface,
              image_url: teamData.venue.image,
            },
            { onConflict: "external_id" }
          )
          .select("id")
          .single();
        if (venueError || !venueRow) throw venueError ?? new Error(`Kunde inte spara arena ${teamData.venue.name}`);
        venueId = venueRow.id;
      }

      // Notera: nicknames/short_history/team_trophy/team_legend/team_rivalry
      // sätts INTE här — de fylls i manuellt i ett separat steg och skrivs
      // aldrig över av en omkörning av det här scriptet (ingår inte i
      // upsert-payloaden).
      const { error } = await supabase.from("team").upsert(
        {
          external_id: teamData.team.id,
          name: teamData.team.name,
          founded_year: teamData.team.founded,
          logo_url: teamData.team.logo,
          venue_name: teamData.venue.name,
          venue_id: venueId,
        },
        { onConflict: "external_id" }
      );
      if (error) throw error;
    }

    console.log(`  ✓ ${data.length} lag (Allsvenskan ${year})`);
  }
}
