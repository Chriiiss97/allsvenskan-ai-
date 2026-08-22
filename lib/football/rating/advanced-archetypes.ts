import type { PositionGroupKey } from "../position-group";
import type { ConfidenceTier } from "../confidence";
import type { AdvancedDNACategoryKey, AdvancedDNACategory } from "../advanced-dna";

/**
 * Fas 10 — avancerade arketyper (Sportmonks-driven). Samma regelbaserade,
 * transparenta filosofi som archetypes.ts (aldrig ML, alltid spårbart,
 * en spelare kan matcha flera samtidigt), men EGEN fil och EGEN källa:
 * konsumerar Fas 9:s redan beräknade `AdvancedPlayerDNA.categories`
 * (compute-on-read, precis som scout-match.ts) — INGENTING skrivs någonsin
 * till `player_season_rating`. archetypes.ts (10 st, Rating-baserade)
 * rörs inte alls — bekräftat via tom diff efter denna fas.
 *
 * Kräver minst "medel" konfidens, samma tröskel som archetypes.ts redan
 * etablerat — en stämpel på tunt underlag vore en gissning.
 *
 * Kandidaterna nedan (Målchansskapare/Bollprogressiv/Luftspelare/
 * Pressande bollvinnare/Kvalitetsavslutare/Bollsäker/Modern box-to-box) är
 * uttryckligen VALDA för att de är omöjliga att bygga med enbart
 * API-Football-data (ingen xG, inget luftduell-särskiljande, ingen
 * bollprogressions-/bollåtervinningsdata) — inte omdöpta versioner av
 * redan existerande arketyper.
 */

export type AdvancedArchetypeGroup = "attacker" | "midfielder" | "defender" | "all";

export interface AdvancedArchetypeContext {
  positionGroup: PositionGroupKey;
  categories: Record<AdvancedDNACategoryKey, AdvancedDNACategory>;
}

function catScore(ctx: AdvancedArchetypeContext, key: AdvancedDNACategoryKey): number | null {
  return ctx.categories[key]?.score ?? null;
}
function metricPct(ctx: AdvancedArchetypeContext, key: AdvancedDNACategoryKey, label: string): number | null {
  return ctx.categories[key]?.metrics.find((m) => m.label === label)?.percentile ?? null;
}

export interface AdvancedArchetypeDefinition {
  key: string;
  label: string;
  definition: string;
  appliesTo: AdvancedArchetypeGroup;
  test: (ctx: AdvancedArchetypeContext) => boolean;
  reason: (ctx: AdvancedArchetypeContext) => string;
}

export const ADVANCED_ARCHETYPES: AdvancedArchetypeDefinition[] = [
  {
    key: "malchansskapare",
    label: "Målchansskapare",
    definition: "Skapar ovanligt många målchanser för sina lagkamrater — mätt via Sportmonks 'målchanser skapade', ett bredare mått än bara nyckelpassningar.",
    appliesTo: "all",
    test: (ctx) => (metricPct(ctx, "bollprogression", "Målchanser skapade") ?? 0) >= 80,
    reason: (ctx) => `Målchanser skapade, percentil ${metricPct(ctx, "bollprogression", "Målchanser skapade")}`,
  },
  {
    key: "bollprogressiv",
    label: "Bollprogressiv spelare",
    definition: "Utmärker sig i att flytta bollen framåt in i farliga områden — passningar i sista tredjedel, långa bollar och målchansskapande tillsammans.",
    appliesTo: "all",
    test: (ctx) => (catScore(ctx, "bollprogression") ?? 0) >= 80,
    reason: (ctx) => `Bollprogression ${catScore(ctx, "bollprogression")}`,
  },
  {
    key: "luftspelare",
    label: "Luftspelare",
    definition: "Vinner ovanligt många luftdueller — ett mått API-Football aldrig kunnat ge (duels_total blandar alla dueltyper).",
    appliesTo: "all",
    test: (ctx) => (catScore(ctx, "luftspel") ?? 0) >= 75,
    reason: (ctx) => `Luftspel ${catScore(ctx, "luftspel")}`,
  },
  {
    key: "pressande_bollvinnare",
    label: "Pressande bollvinnare",
    definition: "Återvinner ovanligt mycket boll — bollåtervinningar, vunna tacklingar och röjningar tillsammans.",
    appliesTo: "all",
    test: (ctx) => (catScore(ctx, "bollatervinning") ?? 0) >= 80,
    reason: (ctx) => `Bollåtervinning ${catScore(ctx, "bollatervinning")}`,
  },
  {
    key: "kvalitetsavslutare_xg",
    label: "Kvalitetsavslutare (xG)",
    definition: "Skapar hög målsannolikhet (xG/xGoT) via sina avslut — en KVALITETSDIMENSION, skild från den befintliga 'Målskytt'-arketypen som bara räknar volym (mål/skott).",
    appliesTo: "attacker",
    test: (ctx) => ctx.positionGroup === "attacker" && (catScore(ctx, "avslutningskvalitet") ?? 0) >= 80,
    reason: (ctx) => `Avslutningskvalitet ${catScore(ctx, "avslutningskvalitet")}`,
  },
  {
    key: "bollsaker_under_press",
    label: "Bollsäker under press",
    definition: "Behåller bollen ovanligt väl — hög bollberöring i kombination med få bollförluster/gånger frånspelad.",
    appliesTo: "all",
    test: (ctx) => (catScore(ctx, "bollsakerhet") ?? 0) >= 80,
    reason: (ctx) => `Bollsäkerhet ${catScore(ctx, "bollsakerhet")}`,
  },
  {
    key: "modern_box_to_box",
    label: "Modern box-to-box (avancerat)",
    definition: "Mittfältare som kombinerar stark bollprogression med stark bollåtervinning — bidrar i båda riktningar. Ärligt kompletterande till den befintliga 'Box-to-box-mittfältare'-DNA-etiketten (som bygger på duellspel/försvar/bollinvolvering), inte en dubblett.",
    appliesTo: "midfielder",
    test: (ctx) => ctx.positionGroup === "midfielder" && (catScore(ctx, "bollprogression") ?? 0) >= 65 && (catScore(ctx, "bollatervinning") ?? 0) >= 65,
    reason: (ctx) => `Bollprogression ${catScore(ctx, "bollprogression")}, Bollåtervinning ${catScore(ctx, "bollatervinning")}`,
  },
];

export interface MatchedAdvancedArchetype {
  key: string;
  label: string;
  definition: string;
  reason: string;
}

/**
 * Alla avancerade arketyper en spelare matchar just nu. Kräver minst
 * "medel" konfidens (samma princip som archetypes.ts) — returnerar ALLTID
 * en array (tom om inget matchar eller konfidensen är för låg).
 */
export function computeAdvancedPlayerArchetypes(
  ctx: AdvancedArchetypeContext,
  confidenceTier: ConfidenceTier | null
): MatchedAdvancedArchetype[] {
  if (confidenceTier === "låg" || confidenceTier === null) return [];

  const matched: MatchedAdvancedArchetype[] = [];
  for (const archetype of ADVANCED_ARCHETYPES) {
    if (archetype.appliesTo !== "all" && archetype.appliesTo !== ctx.positionGroup) continue;
    if (!archetype.test(ctx)) continue;
    matched.push({ key: archetype.key, label: archetype.label, definition: archetype.definition, reason: archetype.reason(ctx) });
  }
  return matched;
}
