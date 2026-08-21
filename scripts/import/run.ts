import { config } from "dotenv";
import path from "node:path";

import { importLeagueAndSeasons } from "./import-league";
import { importTeams } from "./import-teams";
import { importPlayersAndStatistics } from "./import-players";
import { importFixtures } from "./import-fixtures";
import { importFixtureEvents } from "./import-events";
import { importLineups } from "./import-lineups";
import { importTeamStats } from "./import-team-stats";
import { importPlayerStats } from "./import-player-stats";
import { importCoaches } from "./import-coaches";
import { importStandings } from "./import-standings";
import { runPreMatchPipeline } from "./pre-match-pipeline";
import { runLiveTick } from "./live-pipeline";
import { finalizeMatches } from "./finalize-match";
import { seedTeamFacts } from "./seed-team-facts";
import { seedLeagueFacts } from "./seed-league-facts";
import { refreshAllSeasonRatings } from "./refresh-ratings";
import { importSportmonksTypes } from "./import-sportmonks-types";
import { mapSportmonksTeams } from "./sportmonks-map-teams";

config({ path: path.resolve(process.cwd(), ".env.local") });

const STEPS: Record<string, () => Promise<void>> = {
  league: importLeagueAndSeasons,
  teams: importTeams,
  players: importPlayersAndStatistics,
  fixtures: importFixtures,
  events: () => importFixtureEvents(),
  lineups: () => importLineups(),
  "team-stats": () => importTeamStats(),
  "player-stats": () => importPlayerStats(),
  coaches: importCoaches,
  standings: importStandings,
  "pre-match": runPreMatchPipeline,
  live: runLiveTick,
  finalize: finalizeMatches,
  // Engångs-backfill av ALLA säsongers player_season_rating (se migration
  // 20260821120000). Ingen API-Football-koppling (räknar bara om redan
  // importerad fixture_player_stats), kostar 0 av dagskvoten. Efter denna
  // körning håller finalize-cronen den aktuella säsongen fräsch automatiskt.
  ratings: async () => {
    await refreshAllSeasonRatings();
  },
  // ingen API-Football-koppling, kostar inget av dagskvoten
  facts: async () => {
    await seedTeamFacts();
    await seedLeagueFacts();
  },
  // Sportmonks-integration, Fas 0. Egen kvotbudget ("core"-entiteten), körs
  // sällan (typregistret ändras knappt) — INTE del av 'all'.
  "sportmonks-types": async () => {
    await importSportmonksTypes();
  },
  // Fas 1: lag-mappning (team.sportmonks_id). Skriver bara entydiga traffar.
  "sportmonks-map-teams": async () => {
    await mapSportmonksTeams();
  },
  // 'all' kör de billiga stegen (~25 anrop totalt för 2 lag x 3 säsonger).
  // 'events' kör INTE med här — den kostar ett anrop per match och kan
  // ensam äta upp hela dagskvoten. Kör den separat: `npm run import events`.
  all: async () => {
    await importLeagueAndSeasons();
    await importTeams();
    await importPlayersAndStatistics();
    await importFixtures();
    await seedTeamFacts();
    await seedLeagueFacts();
  },
};

async function main() {
  const step = process.argv[2] ?? "all";
  const fn = STEPS[step];
  if (!fn) {
    console.error(`Okänt steg: "${step}". Giltiga steg: ${Object.keys(STEPS).join(", ")}`);
    process.exit(1);
  }

  console.log(`--- Kör import-steg: ${step} ---`);
  try {
    await fn();
    console.log(`--- Klart: ${step} ---`);
  } catch (err) {
    console.error("Import misslyckades:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
