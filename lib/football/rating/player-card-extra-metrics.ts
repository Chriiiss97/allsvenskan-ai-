import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aggregatePlayerSeasonStats } from "./rating-aggregates";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Fas 15 (Complete Scout Player Card) — Player Card-only avancerade mått
 * ============================================================================
 * NY, fristående fil. De `fixture_player_advanced_stats`-fält (Sportmonks
 * 2024+) som är redan IMPORTERADE men inte summerade av advanced-rating-
 * aggregates.ts/advanced-dna.ts ELLER av det befintliga
 * advanced-scout-metrics.ts (Fas 11, `/scout/search`s sökbara mått): stora
 * målchanser missade, inlägg (totalt/lyckade/andel), ramträffar, misstag
 * som ledde till skott, man of the match-utnämningar, utspel bortom mållinjen.
 *
 * MEDVETET EGEN FIL, INTE en utökning av det befintliga
 * `advanced-scout-metrics.ts` — den filen driver redan en skarp, i drift
 * varande sida (`/scout/search`, Fas 14.4); att lägga till åtta nya fält
 * där hade riskerat att röra en fungerande sökmotor för mått som bara
 * Player Card-profilen (denna fas) faktiskt behöver. Rör INTE
 * advanced-rating-aggregates.ts, advanced-dna.ts eller
 * advanced-scout-metrics.ts.
 *
 * Scopat till 2024–2026 (samma Sportmonks-begränsning som all avancerad
 * data i projektet). Samma "hoppa över, aldrig 0"-princip och samma
 * paginerade batch-mönster som `advanced-rating-aggregates.ts` redan
 * etablerat.
 */

export interface PlayerCardExtraMetrics {
  playerId: number;
  minutesPlayed: number;
  bigChancesCreated: number;
  bigChancesMissed: number;
  totalCrosses: number;
  accurateCrosses: number;
  hitWoodwork: number;
  errorLeadToShot: number;
  manOfMatchCount: number;
  clearanceOffline: number;
}

interface AdvancedStatsFieldsRow {
  player_id: number | null;
  big_chances_created: number | null;
  big_chances_missed: number | null;
  total_crosses: number | null;
  accurate_crosses: number | null;
  hit_woodwork: number | null;
  error_lead_to_shot: number | null;
  man_of_match: boolean | null;
  clearance_offline: number | null;
}

/**
 * Batch för en säsong — samma "läs en gång, slå upp per spelare"-princip
 * som resten av Scout-lagret. Returnerar bara spelare som redan finns i
 * bas-aggregatet (dvs. har riktig speltid den säsongen enligt
 * fixture_player_stats) — samma regel som advanced-rating-aggregates.ts.
 */
export async function aggregatePlayerCardExtraMetrics(
  supabase: Supabase,
  params: { seasonId: number }
): Promise<Map<number, PlayerCardExtraMetrics>> {
  const baseAggregates = await aggregatePlayerSeasonStats(supabase, { seasonId: params.seasonId });
  if (baseAggregates.size === 0) return new Map();

  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select("id")
    .eq("season_id", params.seasonId)
    .eq("status", "FT");
  if (fixtureError) throw fixtureError;
  const fixtureIds = (fixtures ?? []).map((f) => f.id);
  if (fixtureIds.length === 0) return new Map();

  const rows: AdvancedStatsFieldsRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("fixture_player_advanced_stats")
      .select(
        "player_id, big_chances_created, big_chances_missed, total_crosses, accurate_crosses, hit_woodwork, error_lead_to_shot, man_of_match, clearance_offline"
      )
      .in("fixture_id", fixtureIds)
      .range(from, from + PAGE - 1)
      .returns<AdvancedStatsFieldsRow[]>();
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const result = new Map<number, PlayerCardExtraMetrics>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const base = baseAggregates.get(row.player_id);
    if (!base) continue; // ingen speltid registrerad i bas-tabellen — hoppa över

    let agg = result.get(row.player_id);
    if (!agg) {
      agg = {
        playerId: row.player_id,
        minutesPlayed: base.minutesPlayed,
        bigChancesCreated: 0,
        bigChancesMissed: 0,
        totalCrosses: 0,
        accurateCrosses: 0,
        hitWoodwork: 0,
        errorLeadToShot: 0,
        manOfMatchCount: 0,
        clearanceOffline: 0,
      };
      result.set(row.player_id, agg);
    }
    agg.bigChancesCreated += row.big_chances_created ?? 0;
    agg.bigChancesMissed += row.big_chances_missed ?? 0;
    agg.totalCrosses += row.total_crosses ?? 0;
    agg.accurateCrosses += row.accurate_crosses ?? 0;
    agg.hitWoodwork += row.hit_woodwork ?? 0;
    agg.errorLeadToShot += row.error_lead_to_shot ?? 0;
    if (row.man_of_match) agg.manOfMatchCount += 1;
    agg.clearanceOffline += row.clearance_offline ?? 0;
  }

  return result;
}
