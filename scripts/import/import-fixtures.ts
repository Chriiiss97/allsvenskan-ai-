import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiFixtureResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS } from "./config";
import { createTeamCache } from "./team-cache";
import { createVenueCache } from "./venue-cache";
import { createRefereeCache } from "./referee-cache";

/**
 * Ligavid import (steg 4): ETT anrop per säsong (/fixtures?league=&season=)
 * ger ALLA matcher i hela ligan, inte bara IFK/AIK:s — tidigare version
 * gjorde ett anrop PER LAG (16-23 anrop/säsong) vilket dels missade matcher
 * mellan två lag som INGENDERA var IFK/AIK, dels var onödigt dyrt eftersom
 * samma match ändå kom med i flera lags svar.
 */
export async function importFixtures() {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);
  const venueCache = createVenueCache(supabase);
  const refereeCache = createRefereeCache(supabase);

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

    console.log(`Hämtar alla matcher: Allsvenskan ${year}...`);
    const { data: fixtures } = await apiFootballGet<ApiFixtureResponse>("/fixtures", {
      league: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
      season: year,
    });

    for (const f of fixtures) {
      const homeTeamId = await teamCache.ensure(f.teams.home);
      const awayTeamId = await teamCache.ensure(f.teams.away);
      const venueId = await venueCache.ensure(f.fixture.venue);
      const refereeId = await refereeCache.ensure(f.fixture.referee);

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
          venue_id: venueId,
          referee_id: refereeId,
        },
        { onConflict: "external_id" }
      );
      if (error) throw error;
    }

    console.log(`  ✓ ${fixtures.length} matcher (Allsvenskan ${year})`);
  }
}
