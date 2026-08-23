import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPositionGroup, selectPeers, type PositionGroupKey } from "./position-group";
import { percentile, invertedPercentile } from "./percentile";
import { tierFromThresholds, worseTier, type ConfidenceTier } from "./confidence";
import {
  aggregateAdvancedPlayerStatsAcrossSeasons,
  type AdvancedPlayerSeasonAggregate,
} from "./scout/advanced-rating-aggregates";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Player DNA — AVANCERAT lager (Fas 9, Sportmonks-integrationen)
 * ============================================================================
 * Ny fil, INTE en utökning av player-dna.ts. Samma STRUKTURELLA mönster
 * (kategorier/score/confidence/playerType/summary/insights, "visa min
 * beräkning") men:
 *   1. Egen, POOLAD peer-pool över BARA 2024–2026 (Sportmonks täcker inte
 *      tidigare säsonger) — ALDRIG blandad med de sex befintliga DNA-
 *      kategoriernas 2016–2026-pool. Två olika källor, ojämförbar
 *      täckning — att slå ihop dem vore att låtsas de mätte samma sak.
 *   2. Fem HELT NYA kategorier, byggda på mått som bara Sportmonks ger
 *      (xG-baserad avslutningskvalitet, bollprogression in i sista
 *      tredjedelen, bollsäkerhet under press, luftspel — obefintligt i
 *      original-DNA:s duels_total som blandar alla dueltyper — och
 *      bollåtervinning bortom ren tacklingsvolym). Bygger INTE om de sex
 *      befintliga kategorierna, kompletterar dem.
 *   3. `available: false` (döljs HELT, aldrig en tom platshållare — samma
 *      UI-princip som redan gäller original-DNA) om spelaren saknar
 *      registrerad Sportmonks-täckning för NÅGON av 2024/2025/2026.
 *
 * Målvakter: ingen profil (samma skäl som original-DNA — inga av dessa
 * fem kategorier är målvaktsrelevanta, och vi har ingen separat
 * målvaktsspecifik avancerad data att bygga en egen profil av).
 */

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type AdvancedDNACategoryKey = "avslutningskvalitet" | "bollprogression" | "bollsakerhet" | "luftspel" | "bollatervinning";

export const ADVANCED_DNA_CATEGORY_LABELS: Record<AdvancedDNACategoryKey, string> = {
  avslutningskvalitet: "Avslutningskvalitet",
  bollprogression: "Bollprogression",
  bollsakerhet: "Bollsäkerhet",
  luftspel: "Luftspel",
  bollatervinning: "Bollåtervinning",
};

const CATEGORY_KEYS: AdvancedDNACategoryKey[] = [
  "avslutningskvalitet",
  "bollprogression",
  "bollsakerhet",
  "luftspel",
  "bollatervinning",
];

/** Samma "primär/sekundär per position"-princip som original-DNA (player-dna.ts:78-83) — dokumenterat en gång här. */
const PRIMARY_CATEGORIES: Record<PositionGroupKey, AdvancedDNACategoryKey[]> = {
  attacker: ["avslutningskvalitet", "bollprogression"],
  midfielder: ["bollprogression", "bollsakerhet", "bollatervinning"],
  defender: ["luftspel", "bollatervinning"],
  goalkeeper: [],
};

export interface AdvancedDNAMetricDetail {
  label: string;
  playerValue: number;
  peerAverage: number;
  percentile: number;
  unit: "/90" | "%";
  lowerIsBetter: boolean;
}

export interface AdvancedDNACategory {
  score: number | null;
  tier: "primary" | "secondary";
  metrics: AdvancedDNAMetricDetail[];
}

export interface AdvancedDNAConfidence {
  tier: ConfidenceTier;
  peerLabel: string;
  peerCount: number;
  ownMinutes: number;
  ownTier: ConfidenceTier;
  peerTier: ConfidenceTier;
  minMinutesApplied: number;
  pooledSeasons: number[];
  /** Alltid "2024+" — en explicit UI-markör så det aldrig kan förväxlas med original-DNA:s 2016–2026-pool. */
  dataEra: "2024+";
}

export interface AdvancedDNAInsight {
  type: "strength" | "weakness" | "unique" | "aha";
  text: string;
  categoryKey?: AdvancedDNACategoryKey;
}

export interface AdvancedPlayerTypeResult {
  label: string | null;
  reason: string | null;
}

export interface AdvancedPlayerDNA {
  available: boolean;
  unavailableReason: string | null;
  categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>;
  confidence: AdvancedDNAConfidence | null;
  playerType: AdvancedPlayerTypeResult;
  summary: string | null;
  insights: AdvancedDNAInsight[];
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------

function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(((numerator / denominator) * 100 + Number.EPSILON) * 10) / 10;
}

function mean(values: number[]): number {
  return Math.round(((values.reduce((a, b) => a + b, 0) / values.length) + Number.EPSILON) * 10) / 10;
}

/** Samma nyckelmängd som lib/football/scout/advanced-categories.ts, men för DNA:s fem kategorier — egen extraktion, inte återanvänd, eftersom mätuppsättningen och avsikten (stil, inte prestation) skiljer sig. */
function extractValue(agg: AdvancedPlayerSeasonAggregate, key: string): number | null {
  switch (key) {
    case "xgPer90":
      return per90(agg.xg, agg.minutesPlayed);
    case "xgotPer90":
      return per90(agg.xgot, agg.minutesPlayed);
    case "passesFinalThirdPer90":
      return per90(agg.passesFinalThird, agg.minutesPlayed);
    case "longBallsPer90":
      return per90(agg.longBalls, agg.minutesPlayed);
    case "chancesCreatedPer90":
      return per90(agg.chancesCreated, agg.minutesPlayed);
    case "touchesPer90":
      return per90(agg.touches, agg.minutesPlayed);
    case "dispossessedPer90":
      return per90(agg.dispossessed, agg.minutesPlayed);
    case "possessionLostPer90":
      return per90(agg.possessionLost, agg.minutesPlayed);
    case "aerialsWonPer90":
      return per90(agg.aerialsWon, agg.minutesPlayed);
    case "aerialsWonPct":
      return pct(agg.aerialsWonPaired, agg.aerialsTotal);
    case "ballRecoveryPer90":
      return per90(agg.ballRecovery, agg.minutesPlayed);
    case "tacklesWonPer90":
      return per90(agg.tacklesWon, agg.minutesPlayed);
    case "clearancesPer90":
      return per90(agg.clearances, agg.minutesPlayed);
    default:
      return null;
  }
}

function buildMetric(
  label: string,
  key: string,
  player: AdvancedPlayerSeasonAggregate,
  peers: AdvancedPlayerSeasonAggregate[],
  unit: "/90" | "%",
  lowerIsBetter = false
): AdvancedDNAMetricDetail | null {
  const playerValue = extractValue(player, key);
  if (playerValue === null) return null;
  const peerValues = peers.map((p) => extractValue(p, key)).filter((v): v is number => v !== null);
  if (peerValues.length === 0) return null;
  return {
    label,
    playerValue,
    peerAverage: mean(peerValues),
    percentile: lowerIsBetter ? invertedPercentile(playerValue, peerValues) : percentile(playerValue, peerValues),
    unit,
    lowerIsBetter,
  };
}

function buildCategory(tier: "primary" | "secondary", metrics: (AdvancedDNAMetricDetail | null)[]): AdvancedDNACategory {
  const usable = metrics.filter((m): m is AdvancedDNAMetricDetail => m !== null);
  if (usable.length === 0) return { score: null, tier, metrics: [] };
  const score = Math.round(usable.reduce((a, m) => a + m.percentile, 0) / usable.length);
  return { score, tier, metrics: usable };
}

function emptyCategories(): Record<AdvancedDNACategoryKey, AdvancedDNACategory> {
  const out = {} as Record<AdvancedDNACategoryKey, AdvancedDNACategory>;
  for (const key of CATEGORY_KEYS) out[key] = { score: null, tier: "secondary", metrics: [] };
  return out;
}

function unavailable(reason: string): AdvancedPlayerDNA {
  return {
    available: false,
    unavailableReason: reason,
    categories: emptyCategories(),
    confidence: null,
    playerType: { label: null, reason: null },
    summary: null,
    insights: [],
  };
}

// ---------------------------------------------------------------------------
// Spelartyp — regelbaserade, positionsspecifika trösklar (samma princip som
// player-dna.ts:s inferPlayerType, egna nya etiketter — tydligt skilda från
// original-DNA:s etiketter så de aldrig kan förväxlas i UI:t).
// ---------------------------------------------------------------------------

function inferAdvancedPlayerType(
  group: PositionGroupKey,
  categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>
): AdvancedPlayerTypeResult {
  const s = (k: AdvancedDNACategoryKey) => categories[k].score;
  const rules: { label: string; test: () => boolean; reason: () => string }[] =
    group === "attacker"
      ? [
          {
            label: "Kvalitetsavslutare",
            test: () => (s("avslutningskvalitet") ?? 0) >= 70,
            reason: () => `Avslutningskvalitet ${s("avslutningskvalitet")}`,
          },
          {
            label: "Bollprogressiv anfallare",
            test: () => (s("bollprogression") ?? 0) >= 70,
            reason: () => `Bollprogression ${s("bollprogression")}`,
          },
        ]
      : group === "midfielder"
        ? [
            {
              label: "Bollsäker regissör",
              test: () => (s("bollsakerhet") ?? 0) >= 70 && (s("bollprogression") ?? 0) >= 55,
              reason: () => `Bollsäkerhet ${s("bollsakerhet")}, Bollprogression ${s("bollprogression")}`,
            },
            {
              label: "Pressande mittfältare",
              test: () => (s("bollatervinning") ?? 0) >= 70,
              reason: () => `Bollåtervinning ${s("bollatervinning")}`,
            },
          ]
        : group === "defender"
          ? [
              {
                label: "Luftstark försvarare",
                test: () => (s("luftspel") ?? 0) >= 70,
                reason: () => `Luftspel ${s("luftspel")}`,
              },
              {
                label: "Utspelande försvarare (avancerat)",
                test: () => (s("bollprogression") ?? 0) >= 65 && (s("bollsakerhet") ?? 0) >= 55,
                reason: () => `Bollprogression ${s("bollprogression")}, Bollsäkerhet ${s("bollsakerhet")}`,
              },
            ]
          : [];

  const match = rules.find((r) => r.test());
  return match ? { label: match.label, reason: match.reason() } : { label: null, reason: null };
}

// ---------------------------------------------------------------------------
// Insikter — lean variant av player-dna.ts:s motor: styrka/svaghet/unik
// kategori + störst enskild avvikelse. Genereras ALDRIG vid låg confidence.
// ---------------------------------------------------------------------------

interface KeyCategories {
  strengthKey: AdvancedDNACategoryKey | null;
  weaknessKey: AdvancedDNACategoryKey | null;
  uniqueKey: AdvancedDNACategoryKey | null;
}

function identifyKeyCategories(categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>): KeyCategories {
  const scored = CATEGORY_KEYS.map((key) => ({ key, cat: categories[key] })).filter((c) => c.cat.score !== null);
  let strengthKey: AdvancedDNACategoryKey | null = null;
  let weaknessKey: AdvancedDNACategoryKey | null = null;
  if (scored.length > 0) {
    const best = scored.reduce((a, b) => (b.cat.score! > a.cat.score! ? b : a));
    const worst = scored.reduce((a, b) => (b.cat.score! < a.cat.score! ? b : a));
    if (best.cat.score! >= 70) strengthKey = best.key;
    if (worst.cat.score! <= 30 && worst.key !== strengthKey) weaknessKey = worst.key;
  }
  const secondaryScored = scored.filter((c) => c.cat.tier === "secondary" && c.key !== strengthKey);
  let uniqueKey: AdvancedDNACategoryKey | null = null;
  if (secondaryScored.length > 0) {
    const bestSecondary = secondaryScored.reduce((a, b) => (b.cat.score! > a.cat.score! ? b : a));
    if (bestSecondary.cat.score! >= 75) uniqueKey = bestSecondary.key;
  }
  return { strengthKey, weaknessKey, uniqueKey };
}

function buildSummary(
  playerType: AdvancedPlayerTypeResult,
  categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>,
  keys: KeyCategories,
  peerLabel: string
): string | null {
  const { strengthKey, weaknessKey, uniqueKey } = keys;
  if (!strengthKey && !weaknessKey && !uniqueKey && !playerType.label) return null;
  const sentences: string[] = [];

  if (playerType.label && strengthKey) {
    sentences.push(
      `${playerType.label} — starkast i ${ADVANCED_DNA_CATEGORY_LABELS[strengthKey].toLowerCase()} (percentil ${categories[strengthKey].score} bland ${peerLabel}, 2024+).`
    );
  } else if (playerType.label) {
    sentences.push(`${playerType.label} (avancerad profil, 2024+).`);
  } else if (strengthKey) {
    sentences.push(
      `Starkast i ${ADVANCED_DNA_CATEGORY_LABELS[strengthKey].toLowerCase()} (percentil ${categories[strengthKey].score} bland ${peerLabel}, 2024+).`
    );
  } else {
    sentences.push(`Jämn avancerad profil bland ${peerLabel} (2024+) — ingen kategori sticker ut tydligt.`);
  }

  if (uniqueKey) {
    sentences.push(
      `Mer oväntat: percentil ${categories[uniqueKey].score} i ${ADVANCED_DNA_CATEGORY_LABELS[uniqueKey].toLowerCase()} — en sekundär kategori för positionen.`
    );
  }
  if (weaknessKey) {
    sentences.push(
      `Svagast är ${ADVANCED_DNA_CATEGORY_LABELS[weaknessKey].toLowerCase()} (percentil ${categories[weaknessKey].score}).`
    );
  }
  return sentences.join(" ");
}

function findBiggestSingleMetricGap(
  categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>
): AdvancedDNAInsight | null {
  let best: { metric: AdvancedDNAMetricDetail; catKey: AdvancedDNACategoryKey } | null = null;
  for (const key of CATEGORY_KEYS) {
    for (const m of categories[key].metrics) {
      const dist = Math.abs(m.percentile - 50);
      if (!best || dist > Math.abs(best.metric.percentile - 50)) best = { metric: m, catKey: key };
    }
  }
  if (!best || Math.abs(best.metric.percentile - 50) < 35) return null;
  const direction = best.metric.percentile > 50 ? "över" : "under";
  return {
    type: "aha",
    categoryKey: best.catKey,
    text: `Största enskilda avvikelsen (avancerat): ${best.metric.label.toLowerCase()} på ${best.metric.playerValue}${best.metric.unit} — klart ${direction} snittet på ${best.metric.peerAverage}${best.metric.unit}.`,
  };
}

// ---------------------------------------------------------------------------
// computeAdvancedPlayerDNA
// ---------------------------------------------------------------------------

async function resolveSportmonksSeasonIds(supabase: Supabase): Promise<number[]> {
  const { data, error } = await supabase.from("season").select("id, year").in("year", [2024, 2025, 2026]);
  if (error) throw error;
  return (data ?? []).map((s) => s.id);
}

/**
 * `season`-parametern styr BARA vilken vy anroparen tittar på (t.ex. döljs
 * blocket för en 2019-vy även om spelaren SENARE fick 2024+-täckning) —
 * peer-poolen är alltid poolad över HELA 2024–2026, oavsett vilket enskilt
 * år som visas, samma princip som original-DNA:s säsongsoberoende pool.
 */
export async function computeAdvancedPlayerDNA(
  supabase: Supabase,
  params: { playerId: number; season: number }
): Promise<AdvancedPlayerDNA> {
  if (![2024, 2025, 2026].includes(params.season)) {
    return unavailable("Avancerad DNA-profil (Sportmonks) finns bara för 2024, 2025 och 2026.");
  }

  const seasonIds = await resolveSportmonksSeasonIds(supabase);
  if (seasonIds.length === 0) return unavailable("Ingen Sportmonks-täckt säsong hittad.");

  const aggregates = await aggregateAdvancedPlayerStatsAcrossSeasons(supabase, { seasonIds });
  const player = aggregates.get(params.playerId);
  if (!player) {
    return unavailable("Spelaren saknar registrerad Sportmonks-avancerad statistik för 2024–2026.");
  }

  const positionGroupInfo = getPositionGroup(player.position);
  if (!positionGroupInfo) return unavailable("Okänd position — kan inte bygga en positionsjusterad avancerad profil.");
  if (positionGroupInfo.group === "goalkeeper") {
    return unavailable("Ingen avancerad DNA-profil för målvakter ännu — inga av de fem kategorierna är målvaktsspecifika.");
  }

  const samePositionOthers = [...aggregates.values()].filter(
    (p) => p.playerId !== params.playerId && getPositionGroup(p.position)?.group === positionGroupInfo.group
  );
  const { peers, summary: peerSummary } = selectPeers(
    samePositionOthers.map((p) => ({ ...p, minutes_played: p.minutesPlayed })),
    positionGroupInfo.label,
    player.minutesPlayed
  );

  const tierFor = (key: AdvancedDNACategoryKey): "primary" | "secondary" =>
    PRIMARY_CATEGORIES[positionGroupInfo.group].includes(key) ? "primary" : "secondary";

  const categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory> = {
    avslutningskvalitet: buildCategory(tierFor("avslutningskvalitet"), [
      buildMetric("xG", "xgPer90", player, peers, "/90"),
      buildMetric("xGoT", "xgotPer90", player, peers, "/90"),
    ]),
    bollprogression: buildCategory(tierFor("bollprogression"), [
      buildMetric("Passningar sista tredjedel", "passesFinalThirdPer90", player, peers, "/90"),
      buildMetric("Långa bollar", "longBallsPer90", player, peers, "/90"),
      buildMetric("Målchanser skapade", "chancesCreatedPer90", player, peers, "/90"),
    ]),
    bollsakerhet: buildCategory(tierFor("bollsakerhet"), [
      buildMetric("Bollberöringar", "touchesPer90", player, peers, "/90"),
      buildMetric("Frånspelad", "dispossessedPer90", player, peers, "/90", true),
      buildMetric("Bollförluster", "possessionLostPer90", player, peers, "/90", true),
    ]),
    luftspel: buildCategory(tierFor("luftspel"), [
      buildMetric("Vunna luftdueller", "aerialsWonPer90", player, peers, "/90"),
      buildMetric("Luftduellandel", "aerialsWonPct", player, peers, "%"),
    ]),
    bollatervinning: buildCategory(tierFor("bollatervinning"), [
      buildMetric("Bollåtervinningar", "ballRecoveryPer90", player, peers, "/90"),
      buildMetric("Vunna tacklingar", "tacklesWonPer90", player, peers, "/90"),
      buildMetric("Röjningar", "clearancesPer90", player, peers, "/90"),
    ]),
  };

  const ownTier = tierFromThresholds(player.minutesPlayed, 900, 450);
  const peerTier = tierFromThresholds(peers.length, 12, 6);
  const confidence: AdvancedDNAConfidence = {
    tier: worseTier(ownTier, peerTier),
    peerLabel: peerSummary.label,
    peerCount: peerSummary.count,
    ownMinutes: player.minutesPlayed,
    ownTier,
    peerTier,
    minMinutesApplied: peerSummary.minMinutesApplied,
    pooledSeasons: [2024, 2025, 2026],
    dataEra: "2024+",
  };

  const lowConfidence = confidence.tier === "låg";
  const playerType = lowConfidence ? { label: null, reason: null } : inferAdvancedPlayerType(positionGroupInfo.group, categories);
  const keyCategories = lowConfidence ? null : identifyKeyCategories(categories);
  const summary = keyCategories ? buildSummary(playerType, categories, keyCategories, peerSummary.label) : null;
  const insights: AdvancedDNAInsight[] = [];
  if (keyCategories) {
    const gap = findBiggestSingleMetricGap(categories);
    if (gap) insights.push(gap);
  }

  return {
    available: true,
    unavailableReason: null,
    categories,
    confidence,
    playerType,
    summary,
    insights,
  };
}
