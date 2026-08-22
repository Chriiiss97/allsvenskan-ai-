import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { computePlayerDNA, type PlayerDNA } from "./player-dna";
import { computeAdvancedPlayerDNA, type AdvancedPlayerDNA } from "./advanced-dna";
import { computeAdvancedDevelopment, type AdvancedDevelopmentSummary } from "./rating/advanced-development";
import { computeRatingForPlayer, type AnyPlayerRating } from "./rating/compute-rating";
import { getPlayerRatingHistory, getStoredSeasonRatings, type SeasonRatingPoint, type StoredSeasonRating } from "./rating/rating-store";
import { getCareerTimeline, getForeignCareerStints, type CareerTimelineEntry, type ForeignCareerStint } from "./career-timeline";
import { getPlayerTrophies, type PlayerTrophy } from "./player-trophies";
import { getCareerJourney, type CareerJourney } from "./career-journey";
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
  foreignCareerStints: ForeignCareerStint[];
  trophies: PlayerTrophy[];
  careerJourney: CareerJourney;
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
    foreignCareerStints,
    trophies,
    careerJourney,
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
    getForeignCareerStints(supabase, { playerId }),
    getPlayerTrophies(supabase, { playerId }),
    getCareerJourney(supabase, { playerId }),
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
    foreignCareerStints,
    trophies,
    careerJourney,
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
const cachedAnalysis = unstable_cache(computePlayerCardAnalysis, ["player-card-analysis-v1"], {
  revalidate: 300,
  tags: ["player-card"],
});

/**
 * PRESTANDAFIX, del 2 (2026-08-22): `unstable_cache` ovan är bekräftat
 * KORREKT och SNABBT i ett riktigt produktionsbygge (`next start`,
 * 220–350ms verifierat) — men Next.js dev-server (`next dev`, den lokala
 * miljön) KRINGGÅR AVSIKTLIGT sin datacache i dev-läge (så man alltid ser
 * färsk data medan man utvecklar), verifierat: samma kod, samma spelare,
 * 4,3–4,9s på VARJE anrop under `next dev`, mot 220–350ms under
 * `next start`. Användarens rapporterade segheten är specifikt på
 * localhost/dev, där unstable_cache alltså aldrig hjälper.
 *
 * Löst med ett eget, minimalt in-memory-lager (bara en Map + TTL) OVANPÅ
 * unstable_cache — helt oberoende av Next.js:s cache-lägen, fungerar
 * identiskt i dev OCH produktion eftersom det bara är vanligt JS-
 * modultillstånd som lever så länge Node-processen (eller Turbopacks
 * modul, tills en filändring tvingar en omladdning) gör det. Ren
 * prestandaoptimering — ändrar aldrig vilken data som returneras, bara
 * hur ofta den räknas om. 60s TTL (kortare än unstable_cache:s 300s) så
 * att man ändå ser ny data relativt snabbt om man aktivt sitter och
 * utvecklar/importerar.
 */
const memoryCache = new Map<string, { data: PlayerCardAnalysis; expiresAt: number }>();
const MEMORY_TTL_MS = 60_000;

export async function getCachedPlayerCardAnalysis(
  playerId: number,
  season: number | null,
  position: string | null,
  isGoalkeeper: boolean,
  teamId: number | null
): Promise<PlayerCardAnalysis> {
  const key = JSON.stringify([playerId, season, position, isGoalkeeper, teamId]);
  const cached = memoryCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await cachedAnalysis(playerId, season, position, isGoalkeeper, teamId);
  memoryCache.set(key, { data, expiresAt: now + MEMORY_TTL_MS });
  return data;
}

/**
 * ============================================================================
 * Fas 15-prestandafix, del 3 (2026-08-22) — snabb delmängd + streaming
 * ============================================================================
 * Även med bägge cache-lagren ovan är FÖRSTA visningen av en given
 * spelare+säsong-kombination fortfarande långsam (~5–6s, uppmätt) — den
 * datan har helt enkelt aldrig räknats ut än. Profilerat exakt VILKA av de
 * 14 delarna som faktiskt är dyra:
 *
 *   computeAdvancedPlayerDNA   ~3,1s   ← dyrast
 *   computeAdvancedDevelopment ~2,7s
 *   computeAgeAdjustedZScores  ~1,4s
 *   aggregatePlayerCardExtraMetrics ~1,0s
 *   computePlayerDNA           ~0,7s
 *   computeRatingForPlayer     ~0,8s
 *   computeConsistencyCoefficients ~0,6s
 *   computeRegressionToMean    ~0,2s
 *   getStoredSeasonRatings     ~0,05s  ← BILLIG
 *   listTeamsWithSeasonSummary ~0,11s  ← BILLIG
 *   getPlayerRatingHistory/getCareerTimeline/getPlayerLineupRoleProfile/
 *   getPlayerMatchLog          alla <0,1s ← BILLIGA
 *
 * Header/Snapshot/Context behöver bara OVR (computeRatingForPlayer),
 * huvudarketyp (getStoredSeasonRatings) och tabellplacering
 * (listTeamsWithSeasonSummary) — alla BILLIGA. De tunga modulerna
 * (DNA/Advancerad DNA/Development/Z-score/konsistens/extra-mått) behövs
 * bara längre ner på sidan (Identity/Performance-extra/Percentiler/Scout
 * Insight).
 *
 * page.tsx hämtar därför den HÄR snabba delmängden SYNKRONT (blockerar
 * första renderingen, men bara ~0,8–1s istället för ~5–6s) och skickar
 * resten till en `<Suspense>`-inpackad async-komponent
 * (PlayerCardHeavySections.tsx) som streamar in när den är klar — exakt
 * samma princip som React/Next.js "progressive rendering": användaren ser
 * OVR/namn/bild/tabellplacering nästan direkt istället för en blank sida
 * i flera sekunder, resten fylls i efterhand. Samma data, samma
 * cache-lager (getCachedPlayerCardAnalysis) används fortfarande av den
 * tunga delen, så en redan varm cache gör HELA sidan snabb ändå.
 */
export interface FastPlayerCardData {
  rating: AnyPlayerRating | null;
  mainArchetypeLabel: string | null;
  standingsLabel: string | null;
}

async function computeFastPlayerCardData(
  playerId: number,
  season: number | null,
  position: string | null,
  teamId: number | null,
  teamName: string | null
): Promise<FastPlayerCardData> {
  const supabase = createAnonClient();

  const seasonRow = season ? await supabase.from("season").select("id").eq("year", season).maybeSingle() : null;
  const seasonId = seasonRow?.data?.id ?? null;

  const [rating, storedRatings, standingsTeams] = await Promise.all([
    season ? computeRatingForPlayer(supabase, { playerId, position, season }) : Promise.resolve(null),
    seasonId ? getStoredSeasonRatings(supabase, seasonId) : Promise.resolve(null),
    season && teamId ? listTeamsWithSeasonSummary(supabase, { season }) : Promise.resolve(null),
  ]);

  let mainArchetypeLabel: string | null = null;
  const ownStoredRating = storedRatings?.find((r) => r.playerId === playerId);
  if (ownStoredRating) {
    // Egen import här (inte i toppen av filen) hade gett en cirkelimport-
    // risk mot rating/archetypes.ts — inget problem, samma modul importeras
    // redan indirekt, men skrivs explicit ut för tydlighet.
    const { computePlayerArchetypes } = await import("./rating/archetypes");
    const archetypes = computePlayerArchetypes(
      { positionGroup: ownStoredRating.positionGroup, categoryScores: ownStoredRating.categoryScores, metricValues: ownStoredRating.metricValues },
      ownStoredRating.confidenceTier
    );
    mainArchetypeLabel = archetypes[0]?.label ?? null;
  }

  let standingsLabel: string | null = null;
  if (standingsTeams && teamId && teamName) {
    const own = standingsTeams.find((t) => t.id === teamId);
    if (own?.rank !== null && own?.rank !== undefined) {
      standingsLabel = `${teamName} — ${own.rank}:a (${own.points ?? "—"} p)`;
    }
  }

  return { rating, mainArchetypeLabel, standingsLabel };
}

const fastMemoryCache = new Map<string, { data: FastPlayerCardData; expiresAt: number }>();

export async function getFastPlayerCardData(
  playerId: number,
  season: number | null,
  position: string | null,
  teamId: number | null,
  teamName: string | null
): Promise<FastPlayerCardData> {
  const key = JSON.stringify([playerId, season, position, teamId, teamName]);
  const cached = fastMemoryCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await computeFastPlayerCardData(playerId, season, position, teamId, teamName);
  fastMemoryCache.set(key, { data, expiresAt: now + MEMORY_TTL_MS });
  return data;
}
