import { config } from "dotenv";
import path from "node:path";

import { importLeagueAndSeasons } from "./import-league";
import { importTeams } from "./import-teams";
import { importPlayersAndStatistics } from "./import-players";
import { importFixtures } from "./import-fixtures";
import { importFixtureEvents } from "./import-events";
import { importCoaches } from "./import-coaches";
import { importStandings } from "./import-standings";
import { seedTeamFacts } from "./seed-team-facts";
import { seedLeagueFacts } from "./seed-league-facts";

config({ path: path.resolve(process.cwd(), ".env.local") });

const STEPS: Record<string, () => Promise<void>> = {
  league: importLeagueAndSeasons,
  teams: importTeams,
  players: importPlayersAndStatistics,
  fixtures: importFixtures,
  events: () => importFixtureEvents(),
  coaches: importCoaches,
  standings: importStandings,
  // ingen API-Football-koppling, kostar inget av dagskvoten
  facts: async () => {
    await seedTeamFacts();
    await seedLeagueFacts();
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
