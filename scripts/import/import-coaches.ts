import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiCoachResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { IMPORT_TEAMS } from "./config";

/**
 * Importerar tränarregistret: ett anrop per lag (/coachs?team=X), som ger
 * karriärhistorik men vi sparar bara grunddata + current_team_id här —
 * fixture_lineup.coach_id (steg 4) blir den riktiga källan till "vilken
 * tränare ledde LAGET I DEN HÄR MATCHEN", inte en gissning utifrån
 * karriärdatum. Se lib/api-football/types.ts för den dokumenterade
 * dedup-varningen (API:t gav två poster för samma verkliga person i steg 1).
 */
export async function importCoaches() {
  const supabase = createAdminClient();

  const { data: teamRows } = await supabase
    .from("team")
    .select("id, external_id")
    .in(
      "external_id",
      IMPORT_TEAMS.map((t) => t.externalId)
    );
  const teamIdByExternal = new Map((teamRows ?? []).map((t) => [t.external_id, t.id]));

  for (const team of IMPORT_TEAMS) {
    const teamId = teamIdByExternal.get(team.externalId);
    if (!teamId) {
      console.warn(`! Lag ${team.name} saknas i databasen, hoppar över.`);
      continue;
    }

    console.log(`Hämtar tränare: ${team.name}...`);
    const { data: coaches } = await apiFootballGet<ApiCoachResponse>("/coachs", { team: team.externalId });

    for (const c of coaches) {
      const { error } = await supabase.from("coach").upsert(
        {
          external_id: c.id,
          full_name: c.name,
          nationality: c.nationality,
          birth_date: c.birth.date,
          photo_url: c.photo,
          current_team_id: c.team?.id === team.externalId ? teamId : null,
        },
        { onConflict: "external_id" }
      );
      if (error) throw error;
    }

    console.log(`  ✓ ${coaches.length} tränarposter (${team.name})`);
  }
}
