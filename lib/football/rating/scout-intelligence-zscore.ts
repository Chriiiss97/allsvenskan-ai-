import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aggregatePlayerSeasonStats } from "./rating-aggregates";
import { aggregateAdvancedPlayerSeasonStats, type AdvancedPlayerSeasonAggregate } from "./advanced-rating-aggregates";
import { getPositionGroup, type PositionGroupKey } from "../position-group";
import { tierFromThresholds, worseTier, type ConfidenceTier } from "../confidence";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Scout Intelligence #1 — Åldersjusterad Z-score (Z_age)
 * ============================================================================
 * EGEN, separat "Scout Intelligence"-fas (2026-08-22, användarens uttryckliga
 * instruktion) — INTE en del av Fas 14-redesignen och INTE en ändring av
 * OVR/Player Rating. Samma filnivå-separationsprincip som
 * advanced-scout-metrics.ts: compute-on-read, ALDRIG persisterat till
 * player_season_rating, ALDRIG importerad av metric-registry.ts/
 * categories.ts/position-rating-config.ts/refresh-ratings.ts.
 *
 * FORMEL (härledd från användarens spec, exakt som angivet):
 *   Z_age = (X_i − μ(Position, Åldersgrupp)) / σ(Position, Åldersgrupp)
 *
 * X_i här: medelvärdet av två separata z-poäng — xG/90 och Skapade
 * målchanser/90 (chancesCreatedPer90) — VARDERA z-poängberäknat separat
 * inom samma peer-pool, sedan medelvärdesbildat. INTE en rå summering av
 * xG + chancesCreated (olika enheter/skalor — hade gjort chancesCreated
 * dominera talet rent numeriskt). Det finns INGET xA-mått i vår data
 * (verifierat: AdvancedPlayerSeasonAggregate har chancesCreated, inte en
 * xA-modellerad sannolikhet) — chancesCreatedPer90 används som den bästa
 * tillgängliga proxyn för "kreativ produktion", dokumenterat här istället
 * för att tyst kalla det xA.
 *
 * PEER-POOL: samma säsong + samma positionsgrupp (anfallare/mittfältare/
 * försvarare — MÅLVAKTER UTESLUTNA, xG/chansskapande saknar mening för
 * dem) + samma åldersgrupp. Åldersgrupper (vedertagen scouting-konvention,
 * inte påhittad av oss): Ungdom ≤21, Prime 22–29, Veteran 30+. Ålder
 * beräknad VID SÄSONGEN (1 juli det säsongsåret som referens — mitt i den
 * svenska säsongskalendern), INTE dagens ålder (lib/football/age.ts:s
 * calculateAge() räknar mot idag — fel för en historisk säsong, därför en
 * egen, lokal ageAtSeason() här snarare än att återanvända den delade
 * funktionen fel).
 *
 * MINIMIUNDERLAG (samma trösklar som redan etablerat i player-dna.ts —
 * INGA nya siffror): pool-urvalet föredrar spelare med ≥450 minuter (som
 * selectPeers()), faller tillbaka till alla om färre än 4 kvalificerar.
 * Confidence-tier: sämsta av (egna minuter: hög≥900/medel≥450) och
 * (peer-antal: hög≥12/medel≥6) — exakt samma tröskelpar som
 * player-dna.ts:s ownTier/peerTier.
 *
 * TOLKNING: Z_age > 0 betyder "presterar över genomsnittet för sin ålder
 * och position". |Z| ≈ 1 = en standardavvikelse (ovanligt men inte
 * extremt), |Z| ≥ 2 = mycket ovanligt (ungefär topp 2–3% i en normal-
 * fördelning) — ANVÄND ALDRIG som ett exakt percentil-påstående, bara som
 * en grov "hur ovanligt är det här"-signal, eftersom poolerna här (typiskt
 * 10–40 spelare) är för små för att en riktig normalfördelning ska vara
 * garanterad.
 *
 * VERIFIERAT innan bygge: 2024–2026 (Sportmonks-täckning, samma
 * begränsning som resten av det avancerade lagret).
 */

export type AgeBracket = "youth" | "prime" | "veteran";
export const AGE_BRACKET_LABELS: Record<AgeBracket, string> = {
  youth: "≤21 år",
  prime: "22–29 år",
  veteran: "30+ år",
};

function ageBracket(age: number): AgeBracket {
  if (age <= 21) return "youth";
  if (age <= 29) return "prime";
  return "veteran";
}

/** Ålder VID säsongen (1 juli det året) — inte dagens ålder. Se filhuvudet. */
function ageAtSeason(birthDate: string | null, seasonYear: number): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = seasonYear - birth.getUTCFullYear();
  const hadBirthdayByJuly1 = birth.getUTCMonth() < 6 || (birth.getUTCMonth() === 6 && birth.getUTCDate() <= 1);
  if (!hadBirthdayByJuly1) age -= 1;
  return age;
}

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return (value / minutes) * 90;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

interface PoolMember {
  playerId: number;
  xgPer90: number | null;
  chancesCreatedPer90: number | null;
  minutesPlayed: number;
}

export interface ZScoreComponent {
  key: "xgPer90" | "chancesCreatedPer90";
  label: string;
  playerValue: number;
  peerMean: number;
  peerStd: number;
  z: number;
}

export interface ZScoreResult {
  available: boolean;
  unavailableReason?: string;
  zScore: number | null;
  components: ZScoreComponent[];
  positionGroup: Exclude<PositionGroupKey, "goalkeeper"> | null;
  ageBracket: AgeBracket | null;
  age: number | null;
  confidence: { tier: ConfidenceTier; ownMinutes: number; peerCount: number; poolLabel: string } | null;
}

/**
 * Batch — beräknar Z_age för ALLA kvalificerade spelare i en säsong i EN
 * genomgång (samma "läs hela ligan en gång, slå upp per spelare"-princip
 * som redan etablerad i hela Fas 8–14-lagret — aldrig N+1-frågor).
 */
export async function computeAgeAdjustedZScores(
  supabase: Supabase,
  params: { seasonId: number; seasonYear: number }
): Promise<Map<number, ZScoreResult>> {
  const [baseAggregates, advancedAggregates] = await Promise.all([
    aggregatePlayerSeasonStats(supabase, { seasonId: params.seasonId }),
    aggregateAdvancedPlayerSeasonStats(supabase, { seasonId: params.seasonId }),
  ]);

  const { data: birthRows } = await supabase.from("player").select("id, birth_date");
  const birthDateByPlayer = new Map((birthRows ?? []).map((r) => [r.id, r.birth_date]));

  // Bygg poolar per (positionsgrupp, åldersgrupp).
  const pools = new Map<string, PoolMember[]>();
  const meta = new Map<number, { positionGroup: Exclude<PositionGroupKey, "goalkeeper">; ageBracket: AgeBracket; age: number }>();

  for (const [playerId, base] of baseAggregates) {
    const groupInfo = getPositionGroup(base.position);
    if (!groupInfo || groupInfo.group === "goalkeeper") continue;
    const age = ageAtSeason(birthDateByPlayer.get(playerId) ?? null, params.seasonYear);
    if (age === null) continue;
    const bracket = ageBracket(age);
    const advanced: AdvancedPlayerSeasonAggregate | undefined = advancedAggregates.get(playerId);

    const member: PoolMember = {
      playerId,
      xgPer90: advanced ? per90(advanced.xg, advanced.minutesPlayed) : null,
      chancesCreatedPer90: advanced ? per90(advanced.chancesCreated, advanced.minutesPlayed) : null,
      minutesPlayed: base.minutesPlayed,
    };
    if (member.xgPer90 === null && member.chancesCreatedPer90 === null) continue; // inget mått alls — ingen mening att posla in i poolen

    const key = `${groupInfo.group}_${bracket}`;
    const pool = pools.get(key) ?? [];
    pool.push(member);
    pools.set(key, pool);
    meta.set(playerId, { positionGroup: groupInfo.group, ageBracket: bracket, age });
  }

  const result = new Map<number, ZScoreResult>();

  for (const [playerId, base] of baseAggregates) {
    const info = meta.get(playerId);
    if (!info) {
      result.set(playerId, {
        available: false,
        unavailableReason: "Ingen position, ålder eller xG/chansskapande-data tillgänglig.",
        zScore: null,
        components: [],
        positionGroup: null,
        ageBracket: null,
        age: null,
        confidence: null,
      });
      continue;
    }

    const key = `${info.positionGroup}_${info.ageBracket}`;
    const fullPool = (pools.get(key) ?? []).filter((m) => m.playerId !== playerId);
    const aboveFloor = fullPool.filter((m) => m.minutesPlayed >= 450);
    const peers = aboveFloor.length >= 4 ? aboveFloor : fullPool;

    const own = pools.get(key)?.find((m) => m.playerId === playerId);
    if (!own || peers.length === 0) {
      result.set(playerId, {
        available: false,
        unavailableReason: "För få jämförbara spelare i samma position/åldersgrupp den här säsongen.",
        zScore: null,
        components: [],
        positionGroup: info.positionGroup,
        ageBracket: info.ageBracket,
        age: info.age,
        confidence: null,
      });
      continue;
    }

    const components: ZScoreComponent[] = [];
    for (const [key2, label] of [
      ["xgPer90", "xG/90"],
      ["chancesCreatedPer90", "Skapade målchanser/90"],
    ] as const) {
      const ownValue = own[key2];
      if (ownValue === null) continue;
      const peerValues = peers.map((p) => p[key2]).filter((v): v is number => v !== null);
      if (peerValues.length === 0) continue;
      const peerMean = mean(peerValues);
      const peerStd = stdDev(peerValues, peerMean);
      if (peerStd === 0) continue; // ingen varians att jämföra mot — inte en gissning, bara utelämnad
      components.push({ key: key2, label, playerValue: ownValue, peerMean, peerStd, z: (ownValue - peerMean) / peerStd });
    }

    if (components.length === 0) {
      result.set(playerId, {
        available: false,
        unavailableReason: "Inget av xG/90 eller chansskapande/90 kunde jämföras (ingen varians i poolen, eller inget eget värde).",
        zScore: null,
        components: [],
        positionGroup: info.positionGroup,
        ageBracket: info.ageBracket,
        age: info.age,
        confidence: null,
      });
      continue;
    }

    const zScore = mean(components.map((c) => c.z));
    const ownTier = tierFromThresholds(base.minutesPlayed, 900, 450);
    const peerTier = tierFromThresholds(peers.length, 12, 6);

    result.set(playerId, {
      available: true,
      zScore: Math.round(zScore * 100) / 100,
      components,
      positionGroup: info.positionGroup,
      ageBracket: info.ageBracket,
      age: info.age,
      confidence: {
        tier: worseTier(ownTier, peerTier),
        ownMinutes: base.minutesPlayed,
        peerCount: peers.length,
        poolLabel: `${AGE_BRACKET_LABELS[info.ageBracket]}, ${info.positionGroup === "attacker" ? "anfallare" : info.positionGroup === "midfielder" ? "mittfältare" : "försvarare"}`,
      },
    });
  }

  return result;
}
