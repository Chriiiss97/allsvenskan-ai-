import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, type PositionGroupKey } from "../position-group";
import { tierFromThresholds, type ConfidenceTier } from "../confidence";
import { invertedPercentile } from "../percentile";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Scout Intelligence #2 — Volatilitets-/konsistenskoefficient (CV_perf)
 * ============================================================================
 * Egen Scout Intelligence-fas (2026-08-22), inte Fas 14, inte OVR. Samma
 * compute-on-read/filnivå-separationsprincip som scout-intelligence-
 * zscore.ts (se den filens huvud för hela resonemanget — upprepas inte
 * här).
 *
 * FORMEL (härledd från användarens spec):
 *   CV_perf = σ(xG_match) / μ(xG_match)
 * — variationskoefficienten för spelarens PER-MATCH xG (från
 * `fixture_player_advanced_stats.xg`, Sportmonks 2024+), över alla
 * matcher spelaren faktiskt fick nämnvärd speltid i den säsongen.
 *
 * VARFÖR PER-MATCH XG, INTE PER-90-NORMALISERAT FÖRST: CV_perf mäter HUR
 * OFÖRUTSÄGBAR bidraget är från match till match (en du-vet-vad-du-får-
 * spelare vs. en "kan göra hattrick, kan vara osynlig"-spelare) — en
 * spelares faktiska matchbidrag, inte en hypotetisk 90-minuters-
 * extrapolering. Matcher med <30 spelade minuter exkluderas (en 5-
 * minuters-inhopp med 0.05 xG skulle annars kunna se ut som en extrem
 * avvikelse rent numeriskt, utan att spelaren faktiskt "presterade
 * ojämnt") — en EGEN, dokumenterad tröskel, skild från MIN_PEER_MINUTES
 * (450, som gäller SÄSONGSTOTALER, ett annat begrepp).
 *
 * MINIMIUNDERLAG: kräver ≥5 kvalificerande matcher (under det: "låg"
 * konfidens, ingen siffra döljs men den är opålitlig) — verifierat innan
 * bygge mot riktig 2025+2026-data: 327 spelare har ≥5 matcher med xG,
 * 210 har ≥10 (median 9/spelare). Confidence-tier: hög ≥10 matcher,
 * medel ≥5, låg annars (EGEN, matchbaserad tröskelpar — spelad-minuter-
 * och peer-antal-trösklarna 900/450/12/6 från player-dna.ts gäller inte
 * här, det här är en helt annan sorts underlag: antal MATCHER med data,
 * inte minuter eller peer-antal).
 *
 * EDGE CASE: om μ(xG_match) ≈ 0 (en spelare med försumbar xG-inblandning,
 * t.ex. en ren defensiv mittfältare) blir CV_perf matematiskt meningslös
 * (division nära noll ger ett skenbart enormt tal). Dessa spelare
 * markeras `available: false` istället för att visa ett vilseledande
 * jättetal.
 *
 * PERCENTIL: CV_perf presenteras ALDRIG som ett bart tal — låg CV = mer
 * konsekvent (bättre), så en INVERTED percentil beräknas mot samma
 * positionsgrupp (selectPeers-liknande, men matchantal istället för
 * minuter som kvalifikationsmått) så användaren ser "mer konsekvent än
 * X% av {position}" istället för att behöva tolka en rå kvot.
 *
 * TOLKNING: hög percentil (låg CV_perf) = pålitlig, jämn presterare varje
 * vecka. Låg percentil (hög CV_perf) = "boom or bust" — kan avgöra en
 * match på egen hand men kan lika gärna vara osynlig. INGETDERA är
 * objektivt "bättre" — en tränare som vill ha en säker hand kontra en
 * som vill ha en matchvinnar-chansspelare värderar de olika, detta måttet
 * beskriver EGENSKAPEN, inte kvaliteten.
 */

const MIN_MATCH_MINUTES = 30;

export interface ConsistencyResult {
  available: boolean;
  unavailableReason?: string;
  cv: number | null;
  matchCount: number;
  meanXg: number | null;
  stdXg: number | null;
  positionGroup: Exclude<PositionGroupKey, "goalkeeper"> | null;
  confidence: ConfidenceTier | null;
  /** Invers percentil (hög = mer konsekvent) mot samma positionsgrupp. null om peer-poolen är för liten. */
  consistencyPercentile: number | null;
  peerCount: number;
}

interface MatchXgRow {
  fixture_id: number;
  player_id: number;
  xg: number;
  minutes_played: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
}

/**
 * Batch — samma "läs hela ligan en gång"-princip som resten av lagret.
 * `positions` (spelare -> position) krävs separat eftersom
 * fixture_player_advanced_stats saknar position (se filhuvudets
 * anmärkning i advanced-rating-aggregates.ts).
 */
export async function computeConsistencyCoefficients(
  supabase: Supabase,
  params: { seasonId: number }
): Promise<Map<number, ConsistencyResult>> {
  const { data: fixtures } = await supabase.from("fixture").select("id").eq("season_id", params.seasonId).eq("status", "FT");
  const fixtureIds = (fixtures ?? []).map((f) => f.id);
  if (fixtureIds.length === 0) return new Map();

  // xg per match, sidnumrerat.
  const xgRows: { fixture_id: number; player_id: number | null; xg: number | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fixture_player_advanced_stats")
      .select("fixture_id, player_id, xg")
      .in("fixture_id", fixtureIds)
      .not("xg", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    xgRows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // Minuter per match, sidnumrerat.
  const statsRows: { fixture_id: number; player_id: number | null; minutes_played: number | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fixture_player_stats")
      .select("fixture_id, player_id, minutes_played")
      .in("fixture_id", fixtureIds)
      .gt("minutes_played", 0)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    statsRows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const minutesByKey = new Map<string, number>();
  for (const r of statsRows) {
    if (!r.player_id) continue;
    minutesByKey.set(`${r.fixture_id}_${r.player_id}`, r.minutes_played ?? 0);
  }

  // Position — MEDVETET från `player.position` (kanoniska Goalkeeper/
  // Defender/Midfielder/Attacker/Forward-strängarna getPositionGroup()
  // förväntar sig), INTE fixture_player_stats.position (som visade sig
  // lagra korta formationskoder — 'G'/'D'/'M'/'F' — vid verifiering; en
  // riktig bugg som gjorde ALLA spelare felklassade som målvakter, fångad
  // och fixad innan denna fas skeppades).
  const { data: playerRows } = await supabase.from("player").select("id, position");
  const positionByPlayer = new Map((playerRows ?? []).map((r) => [r.id, r.position]));

  const byPlayer = new Map<number, MatchXgRow[]>();
  for (const r of xgRows) {
    if (!r.player_id || r.xg === null) continue;
    const minutes = minutesByKey.get(`${r.fixture_id}_${r.player_id}`) ?? 0;
    if (minutes < MIN_MATCH_MINUTES) continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({ fixture_id: r.fixture_id, player_id: r.player_id, xg: r.xg, minutes_played: minutes });
    byPlayer.set(r.player_id, list);
  }

  // Förberäkna rå CV per spelare (innan percentil, som behöver alla klara).
  interface Raw { cv: number | null; matchCount: number; meanXg: number | null; stdXg: number | null; positionGroup: Exclude<PositionGroupKey, "goalkeeper"> | null; unavailableReason?: string }
  const raw = new Map<number, Raw>();
  for (const [playerId, matches] of byPlayer) {
    const groupInfo = getPositionGroup(positionByPlayer.get(playerId) ?? null);
    if (!groupInfo) {
      raw.set(playerId, { cv: null, matchCount: matches.length, meanXg: null, stdXg: null, positionGroup: null, unavailableReason: "Ingen känd position för spelaren." });
      continue;
    }
    if (groupInfo.group === "goalkeeper") {
      raw.set(playerId, { cv: null, matchCount: matches.length, meanXg: null, stdXg: null, positionGroup: null, unavailableReason: "Målvakter uteslutna (xG saknar mening för positionen)." });
      continue;
    }
    if (matches.length < 5) {
      raw.set(playerId, { cv: null, matchCount: matches.length, meanXg: null, stdXg: null, positionGroup: groupInfo.group, unavailableReason: `Bara ${matches.length} matcher med xG ≥${MIN_MATCH_MINUTES} min — minst 5 krävs.` });
      continue;
    }
    const values = matches.map((m) => m.xg);
    const avg = mean(values);
    if (avg < 0.02) {
      raw.set(playerId, { cv: null, matchCount: matches.length, meanXg: avg, stdXg: null, positionGroup: groupInfo.group, unavailableReason: "För låg genomsnittlig xG-inblandning för att en kvot ska vara meningsfull." });
      continue;
    }
    const sd = stdDev(values, avg);
    raw.set(playerId, { cv: Math.round((sd / avg) * 1000) / 1000, matchCount: matches.length, meanXg: avg, stdXg: sd, positionGroup: groupInfo.group });
  }

  // Percentil (invers - lag CV = hog percentil) inom samma positionsgrupp, bland spelare med >=5 matcher.
  // Sparar playerId tillsammans med varje cv-varde sa jag kan exkludera
  // SPELAREN SJALV ur sin egen jamforelsepool korrekt (via id, inte varde -
  // att filtrera pa varde hade av misstag uteslutit andra spelare med
  // exakt samma cv, samma "para ihop rader ratt"-disciplin som resten av
  // projektet).
  const poolByGroup = new Map<string, { playerId: number; cv: number }[]>();
  for (const [pid, r] of raw) {
    if (r.cv === null || !r.positionGroup) continue;
    const pool = poolByGroup.get(r.positionGroup) ?? [];
    pool.push({ playerId: pid, cv: r.cv });
    poolByGroup.set(r.positionGroup, pool);
  }

  const result = new Map<number, ConsistencyResult>();
  for (const [playerId, r] of raw) {
    if (r.cv === null) {
      result.set(playerId, {
        available: false,
        unavailableReason: r.unavailableReason,
        cv: null,
        matchCount: r.matchCount,
        meanXg: r.meanXg,
        stdXg: r.stdXg,
        positionGroup: r.positionGroup,
        confidence: null,
        consistencyPercentile: null,
        peerCount: 0,
      });
      continue;
    }
    const peerPool = (poolByGroup.get(r.positionGroup!) ?? []).filter((p) => p.playerId !== playerId).map((p) => p.cv);
    const percentile = peerPool.length >= 4 ? invertedPercentile(r.cv, peerPool) : null;
    result.set(playerId, {
      available: true,
      cv: r.cv,
      matchCount: r.matchCount,
      meanXg: r.meanXg,
      stdXg: r.stdXg,
      positionGroup: r.positionGroup,
      confidence: tierFromThresholds(r.matchCount, 10, 5),
      consistencyPercentile: percentile,
      peerCount: peerPool.length,
    });
  }

  return result;
}
