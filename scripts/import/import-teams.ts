import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiTeamResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { IMPORT_TEAMS } from "./config";

export async function importTeams() {
  const supabase = createAdminClient();

  for (const team of IMPORT_TEAMS) {
    console.log(`Hämtar lag: ${team.name}...`);
    const { data } = await apiFootballGet<ApiTeamResponse>("/teams", { id: team.externalId });
    const teamData = data[0];
    if (!teamData) {
      console.warn(`  ! Hittade inget lag med id ${team.externalId}, hoppar över.`);
      continue;
    }

    // Notera: nicknames/short_history/team_trophy/team_legend/team_rivalry
    // sätts INTE här — de fylls i manuellt i steg 4 och skrivs aldrig över
    // av en omkörning av det här scriptet (de ingår inte i upsert-payloaden).
    const { error } = await supabase.from("team").upsert(
      {
        external_id: teamData.team.id,
        name: teamData.team.name,
        founded_year: teamData.team.founded,
        logo_url: teamData.team.logo,
        venue_name: teamData.venue.name,
      },
      { onConflict: "external_id" }
    );
    if (error) throw error;
    console.log(`  ✓ ${teamData.team.name}`);
  }
}
