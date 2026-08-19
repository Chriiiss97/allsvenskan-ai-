import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiFixtureResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS, IMPORT_TEAMS } from "./config";
import { createTeamCache } from "./team-cache";

export async function importFixtures() {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);

  const { data: league } = await supabase
    .from("league")
    .select("id")
    .eq("external_id", ALLSVENSKAN_LEAGUE_EXTERNAL_ID)
    .single();
  if (!league) throw new Error("Liga saknas i databasen — kör 'league'-steget först.");

  for (const year of IMPORT_SEASONS) {
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("league_id", league.id)
      .eq("year", year)
      .single();
    if (!seasonRow) {
      console.warn(`! Säsong ${year} saknas i databasen, hoppar över.`);
      continue;
    }

    for (const team of IMPORT_TEAMS) {
      console.log(`Hämtar matcher: ${team.name} ${year}...`);
      // /fixtures stödjer inte page-parametern (till skillnad från /players)
      // — ett anrop per lag/säsong ger redan alla matcher i svaret.
      const { data: fixtures } = await apiFootballGet<ApiFixtureResponse>("/fixtures", {
        team: team.externalId,
        league: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
        season: year,
      });

      for (const f of fixtures) {
        // Motståndare som inte är IFK/AIK finns troligen inte i team-tabellen
        // ännu — team-cachen skapar då en minimal rad (namn + logga) åt oss,
        // eftersom home_team_id/away_team_id är NOT NULL.
        const homeTeamId = await teamCache.ensure(f.teams.home);
        const awayTeamId = await teamCache.ensure(f.teams.away);

        const { error } = await supabase.from("fixture").upsert(
          {
            external_id: f.fixture.id,
            league_id: league.id,
            season_id: seasonRow.id,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            round: f.league.round,
            kickoff_at: f.fixture.date,
            status: f.fixture.status.short,
            home_score: f.goals.home,
            away_score: f.goals.away,
            venue_name: f.fixture.venue.name,
          },
          { onConflict: "external_id" }
        );
        if (error) throw error;
      }

      console.log(`  ✓ ${fixtures.length} matcher (${team.name} ${year})`);
    }
  }
}
