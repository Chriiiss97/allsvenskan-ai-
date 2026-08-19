import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiLeagueResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS } from "./config";

export async function importLeagueAndSeasons() {
  const supabase = createAdminClient();

  console.log("Hämtar liga...");
  const { data } = await apiFootballGet<ApiLeagueResponse>("/leagues", {
    id: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
  });
  const leagueData = data[0];
  if (!leagueData) {
    throw new Error(`Hittade ingen liga med id ${ALLSVENSKAN_LEAGUE_EXTERNAL_ID}`);
  }

  const { data: league, error: leagueError } = await supabase
    .from("league")
    .upsert(
      {
        external_id: leagueData.league.id,
        name: leagueData.league.name,
        country: leagueData.country.name,
        type: leagueData.league.type,
        logo_url: leagueData.league.logo,
      },
      { onConflict: "external_id" }
    )
    .select("id")
    .single();

  if (leagueError || !league) throw leagueError ?? new Error("Kunde inte spara liga");
  console.log(`✓ Liga: ${leagueData.league.name} (id=${league.id})`);

  for (const year of IMPORT_SEASONS) {
    const seasonInfo = leagueData.seasons.find((s) => s.year === year);
    if (!seasonInfo) {
      console.warn(`  ! Säsong ${year} fanns inte i API-svaret, hoppar över.`);
      continue;
    }

    const { error: seasonError } = await supabase.from("season").upsert(
      {
        league_id: league.id,
        year: seasonInfo.year,
        start_date: seasonInfo.start,
        end_date: seasonInfo.end,
        is_current: seasonInfo.current,
      },
      { onConflict: "league_id,year" }
    );
    if (seasonError) throw seasonError;
    console.log(`  ✓ Säsong ${year}${seasonInfo.current ? " (current)" : ""}`);
  }
}
