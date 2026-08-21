import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aggregatePlayerSeasonStats, type PlayerSeasonAggregate } from "./rating-aggregates";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 8 — Level 1 för det AVANCERADE (Sportmonks-källade) måttregistret.
 * Egen fil, egen tabell (`fixture_player_advanced_stats`), ALDRIG
 * importerad av rating-aggregates.ts/metric-registry.ts/categories.ts —
 * samma filnivå-separation som redan bevisad för scout-metrics.ts (en
 * ändring här kan aldrig påverka en redan skeppad OVR-siffra).
 *
 * `fixture_player_advanced_stats` saknar MEDVETET `minutes_played` (se
 * migrationens filhuvud — bara nya/förbättrade fält, ingen dubblett av
 * fixture_player_stats) — minuter lånas därför från den redan befintliga
 * `aggregatePlayerSeasonStats()` (samma säsong), inte omräknat här.
 *
 * SCOPAD TILL 2024–2026 — Sportmonks har ingen Allsvenskan-täckning före
 * 2024 (bekräftat flera gånger denna session). Anroparen ansvarar för att
 * bara fråga efter dessa säsonger; denna fil gissar inget om det.
 */

interface FixturePlayerAdvancedStatsRow {
  player_id: number | null;
  touches: number | null;
  ball_recovery: number | null;
  possession_lost: number | null;
  passes_final_third: number | null;
  aerials_total: number | null;
  aerials_won: number | null;
  long_balls: number | null;
  long_balls_won: number | null;
  chances_created: number | null;
  tackles_won: number | null;
  dispossessed: number | null;
  clearances: number | null;
  xg: number | null;
  xgot: number | null;
}

export interface AdvancedPlayerSeasonAggregate {
  playerId: number;
  /** Lånat från aggregatePlayerSeasonStats (samma säsong) — se filhuvudet. */
  minutesPlayed: number;
  position: string | null;
  touches: number;
  ballRecovery: number;
  possessionLost: number;
  passesFinalThird: number;
  aerialsTotal: number;
  /** OVILLKORAD summa — för aerialsWonPer90 (ren volym). */
  aerialsWon: number;
  /**
   * PARAD summa — bara summerad för matcher där aerials_total OCKSÅ fanns
   * på samma rad. Bugg hittad i Fas 8-verifiering: en ovillkorad summa av
   * aerials_won mot en ovillkorad summa av aerials_total kunde ge
   * aerialsWonPct > 100 % (t.ex. 142,9 %) eftersom en del matcher hade
   * aerials_won men saknade aerials_total — nämnaren blev då artificiellt
   * låg. Samma "para ihop läsningar från samma rad"-princip som
   * rating-aggregates.ts redan använder för passesAccuracyPct.
   */
  aerialsWonPaired: number;
  longBalls: number;
  /** OVILLKORAD summa — för longBallsPer90 (ren volym). */
  longBallsWon: number;
  /** PARAD summa (samma princip som aerialsWonPaired) — för longBallsWonPct. */
  longBallsWonPaired: number;
  chancesCreated: number;
  tacklesWon: number;
  dispossessed: number;
  clearances: number;
  xg: number;
  xgot: number;
}

/** Minimal bas-info per spelare — samma form levereras av både en enskild-säsongs aggregatePlayerSeasonStats och den poolade summan Fas 9 (advanced-dna.ts) bygger. */
interface BasePlayerInfo {
  minutesPlayed: number;
  position: string | null;
}

/**
 * Delad kärna: summerar fixture_player_advanced_stats för en given mängd
 * fixture-id:n mot en redan känd bas-info-karta (minuter/position).
 * Används av BÅDE den enskilda-säsongens Fas 8-funktion (nedan) och den
 * POOLADE flersäsongsfunktionen Fas 9 (advanced-dna.ts) behöver — samma
 * summeringslogik oavsett om det är en eller flera säsonger, ingen risk
 * att de två vägarna tyst driver isär.
 */
async function aggregateAdvancedStatsForFixtures(
  supabase: Supabase,
  fixtureIds: number[],
  baseInfo: Map<number, BasePlayerInfo>
): Promise<Map<number, AdvancedPlayerSeasonAggregate>> {
  if (fixtureIds.length === 0 || baseInfo.size === 0) return new Map();

  const rows: FixturePlayerAdvancedStatsRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("fixture_player_advanced_stats")
      .select(
        "player_id, touches, ball_recovery, possession_lost, passes_final_third, aerials_total, aerials_won, long_balls, long_balls_won, chances_created, tackles_won, dispossessed, clearances, xg, xgot"
      )
      .in("fixture_id", fixtureIds)
      .range(from, from + PAGE - 1)
      .returns<FixturePlayerAdvancedStatsRow[]>();
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const byPlayer = new Map<number, AdvancedPlayerSeasonAggregate>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const base = baseInfo.get(row.player_id);
    if (!base) continue; // ingen speltid registrerad i bas-tabellen för den här mängden fixtures — hoppa över

    let agg = byPlayer.get(row.player_id);
    if (!agg) {
      agg = {
        playerId: row.player_id,
        minutesPlayed: base.minutesPlayed,
        position: base.position,
        touches: 0,
        ballRecovery: 0,
        possessionLost: 0,
        passesFinalThird: 0,
        aerialsTotal: 0,
        aerialsWon: 0,
        aerialsWonPaired: 0,
        longBalls: 0,
        longBallsWon: 0,
        longBallsWonPaired: 0,
        chancesCreated: 0,
        tacklesWon: 0,
        dispossessed: 0,
        clearances: 0,
        xg: 0,
        xgot: 0,
      };
      byPlayer.set(row.player_id, agg);
    }

    agg.touches += row.touches ?? 0;
    agg.ballRecovery += row.ball_recovery ?? 0;
    agg.possessionLost += row.possession_lost ?? 0;
    agg.passesFinalThird += row.passes_final_third ?? 0;
    agg.aerialsTotal += row.aerials_total ?? 0;
    agg.aerialsWon += row.aerials_won ?? 0;
    if (row.aerials_total !== null) agg.aerialsWonPaired += row.aerials_won ?? 0;
    agg.longBalls += row.long_balls ?? 0;
    agg.longBallsWon += row.long_balls_won ?? 0;
    if (row.long_balls !== null) agg.longBallsWonPaired += row.long_balls_won ?? 0;
    agg.chancesCreated += row.chances_created ?? 0;
    agg.tacklesWon += row.tackles_won ?? 0;
    agg.dispossessed += row.dispossessed ?? 0;
    agg.clearances += row.clearances ?? 0;
    agg.xg += row.xg ?? 0;
    agg.xgot += row.xgot ?? 0;
  }

  return byPlayer;
}

/**
 * Hämtar och summerar en hel ligasäsongs avancerade Sportmonks-statistik —
 * samma princip som aggregatePlayerSeasonStats (ingen N+1 per spelare).
 * Returnerar BARA spelare som redan finns i bas-aggregatet (dvs. har
 * riktig speltid den säsongen) — en spelare utan fixture_player_stats-rader
 * kan per definition inte få ett minutantal att dela med.
 */
export async function aggregateAdvancedPlayerSeasonStats(
  supabase: Supabase,
  params: { seasonId: number }
): Promise<Map<number, AdvancedPlayerSeasonAggregate>> {
  const baseAggregates = await aggregatePlayerSeasonStats(supabase, { seasonId: params.seasonId });
  if (baseAggregates.size === 0) return new Map();

  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select("id")
    .eq("season_id", params.seasonId)
    .eq("status", "FT");
  if (fixtureError) throw fixtureError;
  const fixtureIds = (fixtures ?? []).map((f) => f.id);

  const baseInfo = new Map<number, BasePlayerInfo>(
    [...baseAggregates.entries()].map(([id, a]) => [id, { minutesPlayed: a.minutesPlayed, position: a.position }])
  );
  return aggregateAdvancedStatsForFixtures(supabase, fixtureIds, baseInfo);
}

/**
 * Fas 9 (advanced-dna.ts) — POOLAD summa över FLERA säsonger (typiskt
 * 2024+2025+2026, hela Sportmonks-täckningen) i EN gemensam summa per
 * spelare, samma "DNA pooling"-princip som player-dna.ts redan använder
 * för sin 2016–2026-pool. Minuter/position summeras/hämtas per säsong via
 * aggregatePlayerSeasonStats och slås ihop INNAN den avancerade summan
 * byggs, så en spelare som bytt lag mellan säsongerna ändå får korrekt
 * totalt minutantal att dela per-90-talen med.
 */
export async function aggregateAdvancedPlayerStatsAcrossSeasons(
  supabase: Supabase,
  params: { seasonIds: number[] }
): Promise<Map<number, AdvancedPlayerSeasonAggregate>> {
  if (params.seasonIds.length === 0) return new Map();

  const baseInfo = new Map<number, BasePlayerInfo>();
  const allFixtureIds: number[] = [];

  for (const seasonId of params.seasonIds) {
    const seasonBase = await aggregatePlayerSeasonStats(supabase, { seasonId });
    for (const [playerId, agg] of seasonBase) {
      const existing = baseInfo.get(playerId);
      if (existing) {
        existing.minutesPlayed += agg.minutesPlayed;
        // Position kan i teorin skifta (extremt sällsynt) — senaste säsongens vinner, samma "senaste vinner"-princip som redan etablerad i import-teams.ts.
        existing.position = agg.position;
      } else {
        baseInfo.set(playerId, { minutesPlayed: agg.minutesPlayed, position: agg.position });
      }
    }

    const { data: fixtures, error: fixtureError } = await supabase
      .from("fixture")
      .select("id")
      .eq("season_id", seasonId)
      .eq("status", "FT");
    if (fixtureError) throw fixtureError;
    allFixtureIds.push(...(fixtures ?? []).map((f) => f.id));
  }

  return aggregateAdvancedStatsForFixtures(supabase, allFixtureIds, baseInfo);
}

/** Återexporterad för bekvämlighet — anroparen behöver ofta båda aggregaten samtidigt. */
export type { PlayerSeasonAggregate };
