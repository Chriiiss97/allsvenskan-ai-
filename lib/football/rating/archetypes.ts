import type { PositionGroupKey } from "../position-group";
import type { ConfidenceTier } from "../confidence";
import type { StoredMetricValue } from "./rating-store";

/**
 * Scout Engine Fas 3 (2026-08-21) — arketypmotor. Samma regelbaserade
 * filosofi som player-dna.ts:s inferPlayerType (transparent, reproducerbar,
 * ALDRIG ML/gissning), men med TVÅ medvetna skillnader:
 *
 * 1. Byggd på Player Ratings kategori-/mått-percentiler (Fas 2:s sparade
 *    lager), INTE Player DNA:s egna sex kategorier — samma motivering som
 *    hela Scout Engine: Rating har bättre datatäckning (fixture_player_stats
 *    vs statistics) och är redan säsongsscopad. Player DNA rörs inte.
 * 2. En spelare kan matcha FLERA arketyper samtidigt (uttrycklig instruktion)
 *    — till skillnad från inferPlayerType som väljer EN etikett.
 *
 * Kräver minst "medel" konfidens (samma tröskel som rating-trend.ts:s
 * peak-logik) — en arketyp-stämpel på ett 200-minuters-underlag vore en
 * gissning kronad till en etikett, inte ett verkligt mönster.
 */

export type ArchetypeGroup = "attacker" | "midfielder" | "defender" | "goalkeeper" | "all";

export interface ArchetypeDefinition {
  key: string;
  /** Kort, vardagligt namn — Scout:s princip om enkelt språk (inte engelsk scoutingjargong). */
  label: string;
  definition: string;
  appliesTo: ArchetypeGroup;
  test: (ctx: ArchetypeContext) => boolean;
  /** Vilka procenttal som faktiskt avgjorde matchningen — visas i "varför?"-vyn. */
  reason: (ctx: ArchetypeContext) => string;
}

export interface ArchetypeContext {
  positionGroup: PositionGroupKey;
  categoryScores: Record<string, number> | null;
  metricValues: Record<string, StoredMetricValue> | null;
}

function cat(ctx: ArchetypeContext, key: string): number | null {
  return ctx.categoryScores?.[key] ?? null;
}
function metricPct(ctx: ArchetypeContext, key: string): number | null {
  return ctx.metricValues?.[key]?.percentile ?? null;
}

/**
 * ARKETYPER — 10 st, uteslutande byggda på tal vi faktiskt kan räkna fram.
 * Trösklar (80 = "utmärker sig", 70 = "stark" i kombination, 60 = golvet
 * för "allround") är expertbedömda, samma sorts avsiktligt öppna bedömning
 * som position-rating-config.ts:s kategori-vikter — inte statistiskt
 * anpassade mot t.ex. löner eller resultat.
 *
 * "Modern mittback"/"Wingback" ur användarens ursprungliga presetlista
 * byggs INTE som separata arketyper — vi har bara fyra grova
 * positionsgrupper, ingen bäck/mittback-uppdelning, så en sådan etikett
 * hade krävt en positionsprecision datan inte har. "Anfallsstartande
 * försvarare" nedan är en ärlig, databaserad ersättning: en försvarare
 * som ALSO är stark i passning, utan att låtsas veta VILKEN sorts
 * försvarare det är.
 */
export const ARCHETYPES: ArchetypeDefinition[] = [
  {
    key: "malskytt",
    label: "Målskytt",
    definition: "Utmärker sig i avslutning (mål, skott, skott på mål) jämfört med andra på samma position.",
    appliesTo: "all",
    test: (ctx) => (cat(ctx, "shooting") ?? 0) >= 80,
    reason: (ctx) => `Avslutning ${cat(ctx, "shooting")}`,
  },
  {
    key: "spelfordelare",
    label: "Spelfördelare",
    definition: "Utmärker sig i passning — volym, säkerhet och nyckelpassningar.",
    appliesTo: "all",
    test: (ctx) => (cat(ctx, "passing") ?? 0) >= 80,
    reason: (ctx) => `Passning ${cat(ctx, "passing")}`,
  },
  {
    key: "dribblare",
    label: "Dribblare",
    definition: "Utmärker sig i dribbling — försök, lyckade dribblingar och andel.",
    appliesTo: "all",
    test: (ctx) => (cat(ctx, "dribbling") ?? 0) >= 80,
    reason: (ctx) => `Dribbling ${cat(ctx, "dribbling")}`,
  },
  {
    key: "bollvinnare",
    label: "Bollvinnare",
    definition: "Utmärker sig i försvarsspel — tacklingar, interceptions och vunna dueller.",
    appliesTo: "all",
    test: (ctx) => (cat(ctx, "defending") ?? 0) >= 80,
    reason: (ctx) => `Försvarsspel ${cat(ctx, "defending")}`,
  },
  {
    key: "allround",
    label: "Allround-spelare",
    definition: "Ingen enskild svag kategori — stark bredd snarare än en spetsförmåga.",
    appliesTo: "all",
    test: (ctx) =>
      (cat(ctx, "shooting") ?? 0) >= 60 &&
      (cat(ctx, "passing") ?? 0) >= 60 &&
      (cat(ctx, "dribbling") ?? 0) >= 60 &&
      (cat(ctx, "defending") ?? 0) >= 60,
    reason: (ctx) =>
      `Avslutning ${cat(ctx, "shooting")}, Passning ${cat(ctx, "passing")}, Dribbling ${cat(ctx, "dribbling")}, Försvarsspel ${cat(ctx, "defending")}`,
  },
  {
    key: "progressiv_anfallsspelare",
    label: "Progressiv anfallsspelare",
    definition: "Kombinerar stark dribbling med stark avslutning — bär bollen framåt och avslutar själv.",
    appliesTo: "all",
    test: (ctx) => (cat(ctx, "dribbling") ?? 0) >= 70 && (cat(ctx, "shooting") ?? 0) >= 60,
    reason: (ctx) => `Dribbling ${cat(ctx, "dribbling")}, Avslutning ${cat(ctx, "shooting")}`,
  },
  {
    key: "anfallsstartande_forsvarare",
    label: "Anfallsstartande försvarare",
    definition: "Försvarare med stark passning — startar anfall från egen planhalva. (Ärlig ersättning för \"modern mittback\"/\"wingback\" — vi har bara grova positionsgrupper, inte bäck/mittback-precision.)",
    appliesTo: "defender",
    test: (ctx) => ctx.positionGroup === "defender" && (cat(ctx, "passing") ?? 0) >= 70,
    reason: (ctx) => `Försvarare, Passning ${cat(ctx, "passing")}`,
  },
  {
    key: "shot_stopper",
    label: "Räddare",
    definition: "Målvakt med hög räddningsprocent jämfört med andra målvakter.",
    appliesTo: "goalkeeper",
    test: (ctx) => (metricPct(ctx, "savePct") ?? 0) >= 80,
    reason: (ctx) => `Räddningsprocent, percentil ${metricPct(ctx, "savePct")}`,
  },
  {
    key: "trygg_malvakt",
    label: "Trygg målvakt",
    definition: "Målvakt som släpper in färre mål per 90 minuter än andra målvakter.",
    appliesTo: "goalkeeper",
    test: (ctx) => (metricPct(ctx, "goalsConcededPer90") ?? 0) >= 80,
    reason: (ctx) => `Insläppta mål/90, percentil ${metricPct(ctx, "goalsConcededPer90")}`,
  },
  {
    key: "nollstallare",
    label: "Nollställare",
    definition: "Målvakt med hög andel matcher utan insläppt mål (clean sheets).",
    appliesTo: "goalkeeper",
    test: (ctx) => (metricPct(ctx, "cleanSheetPct") ?? 0) >= 80,
    reason: (ctx) => `Clean sheet-andel, percentil ${metricPct(ctx, "cleanSheetPct")}`,
  },
];

export interface MatchedArchetype {
  key: string;
  label: string;
  definition: string;
  reason: string;
}

/**
 * Alla arketyper en spelare matchar just nu — kräver minst "medel"
 * konfidens (samma princip som rating-trend.ts:s peak-logik). Returnerar
 * ALLTID en array (tom om inget matchar eller konfidensen är för låg),
 * aldrig ett gissat enstaka resultat.
 */
export function computePlayerArchetypes(ctx: ArchetypeContext, confidenceTier: ConfidenceTier | null): MatchedArchetype[] {
  if (confidenceTier === "låg" || confidenceTier === null) return [];

  const matched: MatchedArchetype[] = [];
  for (const archetype of ARCHETYPES) {
    if (archetype.appliesTo !== "all" && archetype.appliesTo !== ctx.positionGroup) continue;
    if (!archetype.test(ctx)) continue;
    matched.push({ key: archetype.key, label: archetype.label, definition: archetype.definition, reason: archetype.reason(ctx) });
  }
  return matched;
}
