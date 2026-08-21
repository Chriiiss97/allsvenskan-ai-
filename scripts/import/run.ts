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
import { mapSportmonksFixtures } from "./sportmonks-map-fixtures";
import { mapSportmonksPlayers } from "./sportmonks-map-players";
import { reviewSportmonksPlayers } from "./sportmonks-review-players";
import { importSportmonksXg } from "./sportmonks-import-xg";
import { importSportmonksPlayerAdvancedStats } from "./sportmonks-import-player-advanced-stats";
import { importSportmonksMatchDataBackfill, pollSportmonksLiveMatchData } from "./sportmonks-import-match-data";
import { importSportmonksPressure } from "./sportmonks-import-pressure";
import { importSportmonksMatchFacts } from "./sportmonks-import-match-facts";

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
  // Fas 2: fixture-mappning (fixture.sportmonks_id). Kraver Fas 1 kord forst.
  "sportmonks-map-fixtures": async () => {
    await mapSportmonksFixtures();
  },
  // Fas 3: spelarmappning (player.sportmonks_id). Kraver Fas 1 kord forst.
  "sportmonks-map-players": async () => {
    await mapSportmonksPlayers();
  },
  "sportmonks-review-players": async () => {
    await reviewSportmonksPlayers();
  },
  // Fas 4: xG-familjen, lagniva. Kraver Fas 1+2 korda forst.
  "sportmonks-xg": async () => {
    await importSportmonksXg();
  },
  // Fas 5: per-spelare avancerad matchstatistik. Kraver Fas 1-3 korda forst.
  "sportmonks-player-advanced-stats": async () => {
    await importSportmonksPlayerAdvancedStats();
  },
  // Fas 5b: events/trends/vader/metadata for fardigspelade matcher.
  "sportmonks-match-data": async () => {
    await importSportmonksMatchDataBackfill();
  },
  // Fas 5b live-poll - EN tick, obeprovad mot en riktig pagaende match, se
  // sportmonks-import-match-data.ts:s kommentar.
  "sportmonks-live-poll": async () => {
    await pollSportmonksLiveMatchData();
  },
  // Fas 6: Pressure Index.
  "sportmonks-pressure": async () => {
    await importSportmonksPressure();
  },
  // Fas 7: Match Facts.
  "sportmonks-match-facts": async () => {
    await importSportmonksMatchFacts();
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
