import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aggregatePlayerSeasonStats } from "./rating-aggregates";
import { aggregateAdvancedPlayerSeasonStats } from "./advanced-rating-aggregates";
import { ADVANCED_SCOUT_METRICS, computeAdvancedScoutMetrics, type AdvancedScoutPlayerData } from "./advanced-scout-metrics";
import { getPositionGroup, MIN_PEER_MINUTES, type PositionGroupKey } from "../position-group";
import { calculateAge } from "../age";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — /scout/search, den
 * verkliga kriterie-sökningen ("xG/90 > 0.20 OCH Bollåtervinningar >
 * 80:e percentilen") planen efterfrågade. Bygger på Fas 11:s
 * ADVANCED_SCOUT_METRICS/computeAdvancedScoutMetrics — som fanns färdiga i
 * koden men ALDRIG kopplades in i något UI förrän nu (grep-verifierat: noll
 * träffar utanför den egna filen innan denna fas). Ingen ny beräkningslogik
 * uppfunnen, bara den redan byggda motorn äntligen kopplad till en sida.
 *
 * Percentiler räknas position-för-position (samma princip som resten av
 * appen — en anfallares xG jämförs med ANDRA anfallare, inte hela ligan)
 * mot en flat MIN_PEER_MINUTES-kvalificerad pool (450 min, samma golv som
 * resten av Scout) — ingen confidence-tiering behövs här (sökningen visar
 * bara de spelare som redan klarar poolgolvet, inte en enskild spelares
 * "hur säkert är detta"-badge).
 *
 * bigChancesCreatedPer90 är MEDVETET utelämnad ur listan av sökbara mått —
 * fältet kräver en separat fixture_player_advanced_stats-fråga per
 * advanced-scout-metrics.ts:s egen kommentar (persisteras inte i
 * AdvancedPlayerSeasonAggregate), och med bara 14 % täckning är värdet av
 * att söka på det lågt nog att skjuta upp till en senare fas snarare än
 * att lägga till en extra frågeväg för ett sällan ifyllt fält nu.
 */

export interface ScoutSearchCriterion {
  metricKey: string;
  minValue?: number;
  minPercentile?: number;
}

export interface ScoutSearchParams {
  seasonId: number;
  positionGroup?: Exclude<PositionGroupKey, "goalkeeper">;
  ageMin?: number;
  ageMax?: number;
  criteria: ScoutSearchCriterion[];
}

export interface ScoutSearchResultRow {
  playerId: number;
  fullName: string;
  teamId: number;
  position: string | null;
  positionGroup: Exclude<PositionGroupKey, "goalkeeper">;
  minutesPlayed: number;
  age: number | null;
  matches: { metricKey: string; label: string; value: number; percentile: number }[];
}

export const SEARCHABLE_METRICS = ADVANCED_SCOUT_METRICS.filter((m) => m.key !== "bigChancesCreatedPer90");

export async function searchScoutPlayers(supabase: Supabase, params: ScoutSearchParams): Promise<ScoutSearchResultRow[]> {
  const [baseAggregates, advancedAggregates] = await Promise.all([
    aggregatePlayerSeasonStats(supabase, { seasonId: params.seasonId }),
    aggregateAdvancedPlayerSeasonStats(supabase, { seasonId: params.seasonId }),
  ]);

  interface Entry {
    playerId: number;
    fullName: string;
    teamId: number;
    position: string | null;
    positionGroup: Exclude<PositionGroupKey, "goalkeeper">;
    minutesPlayed: number;
    age: number | null;
    data: AdvancedScoutPlayerData;
  }

  const qualified: Entry[] = [];
  for (const [playerId, base] of baseAggregates) {
    if (base.minutesPlayed < MIN_PEER_MINUTES) continue;
    const groupInfo = getPositionGroup(base.position);
    if (!groupInfo || groupInfo.group === "goalkeeper") continue; // scout-mått som xG/bollåtervinning saknar mening för målvakter
    if (params.positionGroup && groupInfo.group !== params.positionGroup) continue;
    const age = calculateAge(base.birthDate);
    if (params.ageMin !== undefined && (age === null || age < params.ageMin)) continue;
    if (params.ageMax !== undefined && (age === null || age > params.ageMax)) continue;

    qualified.push({
      playerId,
      fullName: base.fullName,
      teamId: base.teamId,
      position: base.position,
      positionGroup: groupInfo.group,
      minutesPlayed: base.minutesPlayed,
      age,
      data: { base, advanced: advancedAggregates.get(playerId), bigChancesCreated: undefined },
    });
  }

  // Peer-pooler byggs EN gång per positionsgrupp (inte per spelare) — annars
  // O(n²) över hela ligan för varje mått.
  const poolByGroup = new Map<string, AdvancedScoutPlayerData[]>();
  for (const e of qualified) {
    const pool = poolByGroup.get(e.positionGroup) ?? [];
    pool.push(e.data);
    poolByGroup.set(e.positionGroup, pool);
  }

  const results: ScoutSearchResultRow[] = [];
  for (const e of qualified) {
    const peers = (poolByGroup.get(e.positionGroup) ?? []).filter((p) => p !== e.data);
    const metricResults = computeAdvancedScoutMetrics(e.data, peers);

    const matches: ScoutSearchResultRow["matches"] = [];
    let matchesAll = params.criteria.length > 0;
    for (const criterion of params.criteria) {
      const metric = metricResults[criterion.metricKey];
      const passesValue = criterion.minValue === undefined || (metric && metric.value >= criterion.minValue);
      const passesPercentile = criterion.minPercentile === undefined || (metric && metric.percentile >= criterion.minPercentile);
      if (!metric || !passesValue || !passesPercentile) {
        matchesAll = false;
        continue;
      }
      const def = SEARCHABLE_METRICS.find((m) => m.key === criterion.metricKey);
      matches.push({ metricKey: criterion.metricKey, label: def?.label ?? criterion.metricKey, value: metric.value, percentile: metric.percentile });
    }

    if (params.criteria.length > 0 && !matchesAll) continue;

    results.push({
      playerId: e.playerId,
      fullName: e.fullName,
      teamId: e.teamId,
      position: e.position,
      positionGroup: e.positionGroup,
      minutesPlayed: e.minutesPlayed,
      age: e.age,
      matches,
    });
  }

  // Sortering: flest/starkaste träffar först (summan av matchade percentiler) — annars alfabetiskt.
  return results.sort((a, b) => {
    const sumA = a.matches.reduce((s, m) => s + m.percentile, 0);
    const sumB = b.matches.reduce((s, m) => s + m.percentile, 0);
    if (sumA !== sumB) return sumB - sumA;
    return a.fullName.localeCompare(b.fullName, "sv");
  });
}
