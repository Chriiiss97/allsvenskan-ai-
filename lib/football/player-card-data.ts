import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { computePlayerDNA, type PlayerDNA } from "./player-dna";
import { computeAdvancedPlayerDNA, type AdvancedPlayerDNA } from "./advanced-dna";
import { computeAdvancedDevelopment, type AdvancedDevelopmentSummary } from "./rating/advanced-development";
import { computeRatingForPlayer, type AnyPlayerRating } from "./rating/compute-rating";
import { getPlayerRatingHistory, getStoredSeasonRatings, type SeasonRatingPoint, type StoredSeasonRating } from "./rating/rating-store";
import { getCareerTimeline, type CareerTimelineEntry } from "./career-timeline";
import { computeRegressionToMean, type RegressionPrediction } from "./rating/scout-intelligence-regression";
import { listTeamsWithSeasonSummary, type TeamOverviewRow } from "./catalog";
import { getPlayerLineupRoleProfile, type PlayerLineupRoleProfile } from "./lineup-role";
import { computeAgeAdjustedZScores, type ZScoreResult } from "./rating/scout-intelligence-zscore";
import { computeConsistencyCoefficients, type ConsistencyResult } from "./rating/scout-intelligence-consistency";
import { getPlayerMatchLog, type PlayerMatchLog } from "./player-match-log";
import { aggregatePlayerCardExtraMetrics, type PlayerCardExtraMetrics } from "./rating/player-card-extra-metrics";

/**
 * ============================================================================
 * Fas 15-prestandafix (2026-08-22) — cachad Player Card-analys
 * ============================================================================
 * Profilerat: en full sidladdning gjorde ~14 tunga "hela ligan/hela
 * säsongen"-aggregeringar (var för sig 0,5–3+ sekunder — se körlogg,
 * computeAdvancedPlayerDNA ensam tog 3,1s) — alla oberoende av VARANDRA,
 * men flera oberoende av VARANDRA:s resultat körde ändå sekventiellt innan
 * denna fix. Att bara köra dem parallellt (Promise.all i page.tsx) gav en
 * viss förbättring men inte i närheten av "millisekunder", eftersom
 * databasen/Postgres själv gör påtagligt arbete per fråga (tabellskanningar
 * över statistics/fixture_player_stats/fixture_player_advanced_stats) —
 * fler SAMTIDIGA tunga frågor konkurrerar om samma DB-resurser, de köar
 * inte bara.
 *
 * DEN VERKLIGA fixen: all denna data är OFÖRÄNDRAD mellan importkörningar
 * (cron/manuella scripts, inte varje sidladdning) och ALDRIG
 * användarspecifik (alla lästa tabeller har `for select using (true)` —
 * public read, se DATABASE.md) — den kan alltså cachas GLOBALT (delas
 * mellan alla besökare) utan någon risk för att läcka en annan användares
 * data. `unstable_cache` (Next.js inbyggda datacache — projektet har INTE
 * satt `cacheComponents: true` i next.config.ts, så `"use cache"`-
 * direktivet är inte aktiverat här; `unstable_cache` är den korrekta,
 * fungerande cache-API:n för DEN HÄR appen, bekräftat mot
 * node_modules/next/dist/docs innan den användes, per AGENTS.md:s regel).
 *
 * VIKTIGT: skapar en EGEN, kakfri Supabase-klient (anon-nyckel, ingen
 * cookies()-koppling) — `unstable_cache` tillåter INTE att en cachad
 * funktion läser dynamiska API:er som cookies/headers, och en
 * request-bunden klient (lib/supabase/server.ts) får sin auth-kontext från
 * just cookies(). Helt korrekt här: alla lästa tabeller är publik läsdata,
 * inget behov av inloggningskontext.
 *
 * Personlig data (shortlist-stjärna, inloggad användare) cachas ALDRIG
 * här — den frågas fortfarande separat i page.tsx med den vanliga
 * request-bundna klienten, exakt som innan.
 *
 * revalidate: 300s (5 min) — gott om marginal mot hur ofta import-cronen
 * faktiskt kör, ingen anledning till kortare TTL för data som bara ändras
 * i batch-körningar.
 */

function createAnonClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export interface PlayerCardAnalysis {
  dna: PlayerDNA | null;
  advancedDna: AdvancedPlayerDNA | null;
  advancedDevelopment: AdvancedDevelopmentSummary;
  rating: AnyPlayerRating | null;
  ratingHistory: SeasonRatingPoint[];
  careerTimeline: CareerTimelineEntry[];
  regressionResult: RegressionPrediction | null;
  standingsTeams: TeamOverviewRow[] | null;
  lineupRole: PlayerLineupRoleProfile | null;
  zScoresResult: ZScoreResult | null;
  consistencyResult: ConsistencyResult | null;
  storedRatings: StoredSeasonRating[] | null;
  matchLog: PlayerMatchLog;
  extraMetrics: PlayerCardExtraMetrics | null;
  seasonId: number | null;
}

async function computePlayerCardAnalysis(
  playerId: number,
  season: number | null,
  position: string | null,
  isGoalkeeper: boolean,
  teamId: number | null
): Promise<PlayerCardAnalysis> {
  const supabase = createAnonClient();
  const isSportmonksSeason = season !== null && [2024, 2025, 2026].includes(season);

  const seasonId: number | null = season
    ? ((await supabase.from("season").select("id").eq("year", season).maybeSingle()).data?.id ?? null)
    : null;

  const [
    dna,
    advancedDna,
    advancedDevelopment,
    rating,
    ratingHistory,
    careerTimeline,
    regressionBatch,
    standingsTeams,
    lineupRole,
    zScoresMap,
    consistenciesMap,
    storedRatings,
    matchLog,
    extraMetricsMap,
  ] = await Promise.all([
    season ? computePlayerDNA(supabase, { playerId, season }) : Promise.resolve(null),
    isSportmonksSeason ? computeAdvancedPlayerDNA(supabase, { playerId, season: season! }) : Promise.resolve(null),
    computeAdvancedDevelopment(supabase, { playerId }),
    season ? computeRatingForPlayer(supabase, { playerId, position, season }) : Promise.resolve(null),
    getPlayerRatingHistory(supabase, playerId),
    getCareerTimeline(supabase, { playerId }),
    season ? computeRegressionToMean(supabase, { currentSeasonYear: season }) : Promise.resolve(null),
    season && teamId ? listTeamsWithSeasonSummary(supabase, { season }) : Promise.resolve(null),
    seasonId ? getPlayerLineupRoleProfile(supabase, { playerId, seasonId }) : Promise.resolve(null),
    seasonId && season ? computeAgeAdjustedZScores(supabase, { seasonId, seasonYear: season }) : Promise.resolve(null),
    seasonId ? computeConsistencyCoefficients(supabase, { seasonId }) : Promise.resolve(null),
    seasonId ? getStoredSeasonRatings(supabase, seasonId) : Promise.resolve(null),
    seasonId
      ? getPlayerMatchLog(supabase, { playerId, seasonId, position })
      : Promise.resolve({ available: false, isGoalkeeper, entries: [] }),
    seasonId && isSportmonksSeason ? aggregatePlayerCardExtraMetrics(supabase, { seasonId }) : Promise.resolve(null),
  ]);

  return {
    dna,
    advancedDna,
    advancedDevelopment,
    rating,
    ratingHistory,
    careerTimeline,
    // `unstable_cache` serialiserar returvärdet (INTE en strukturerad klon) —
    // en Map (regressionBatch.results) hade tappat sin prototyp och blivit
    // ett vanligt objekt utan .get(), vilket kraschade sidan i produktion
    // (TypeError: results.get is not a function, upptäckt vid verifiering
    // mot en riktig `next start`-körning innan detta skeppades). Löses genom
    // att slå upp EGNA spelarens rad INNAN cachningen, precis som redan
    // gjordes för zScore/consistency/extraMetrics nedan.
    regressionResult: regressionBatch?.results.get(playerId) ?? null,
    standingsTeams,
    lineupRole,
    zScoresResult: zScoresMap?.get(playerId) ?? null,
    consistencyResult: consistenciesMap?.get(playerId) ?? null,
    storedRatings,
    matchLog,
    extraMetrics: extraMetricsMap?.get(playerId) ?? null,
    seasonId,
  };
}

/**
 * Cache-nyckeln inkluderar allt beräkningen faktiskt beror på (playerId,
 * säsong, position, målvaktsflagga, lag-id för tabellplacering) — en annan
 * kombination av dessa ger alltid en egen cache-post, aldrig fel spelares
 * data.
 */
export const getCachedPlayerCardAnalysis = unstable_cache(computePlayerCardAnalysis, ["player-card-analysis-v1"], {
  revalidate: 300,
  tags: ["player-card"],
});
