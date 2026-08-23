/**
 * OVR v2 — arketyper.
 * =============================================================================
 * Ersätter lib/football/scout/archetypes.ts. Samma regelbaserade filosofi:
 * transparent, reproducerbar, aldrig ML eller gissning. En spelare kan matcha
 * flera arketyper samtidigt.
 *
 * -----------------------------------------------------------------------------
 * VAD SOM BLEV MÖJLIGT MED V2
 * -----------------------------------------------------------------------------
 * Den gamla filen bar en uttrycklig ursäkt i sin egen kommentar:
 *
 *     "Modern mittback"/"Wingback" ur användarens ursprungliga presetlista
 *     byggs INTE som separata arketyper — vi har bara fyra grova
 *     positionsgrupper, ingen bäck/mittback-uppdelning.
 *
 * Den begränsningen är borta. OVR v2 har sex positionsgrupper där ytterbackar
 * och offensiva mittfältare är egna grupper med egna vikttabeller och egna
 * peers, härledda ur var spelaren faktiskt startat (fixture_lineup_player.grid).
 * Både "Modern mittback" och "Offensiv ytterback" finns därför nedan som
 * riktiga arketyper, inte som en ärlig men trubbig ersättning.
 *
 * Dessutom har varje utespelare numera alla fem utespelardelbetyg — tidigare
 * saknade en mittback både avslutnings- och dribblingsbetyg, vilket gjorde
 * halva arketyplistan otestbar för honom.
 *
 * -----------------------------------------------------------------------------
 * ENHETEN ÄR OVR, INTE PERCENTIL
 * -----------------------------------------------------------------------------
 * Delbetygen ligger på samma 48–91-skala som huvudbetyget. Trösklarna i
 * config.ARCHETYPE_THRESHOLDS är uttryckta i den enheten. Att av vana skriva
 * ">= 80" här vore ett fel som inte syns: OVR 80 motsvarar ungefär 93:e
 * percentilen, så arketypen hade tystnat helt i stället för att träffa var
 * femte spelare.
 */

import { ARCHETYPE_THRESHOLDS, type PositionGroup, type SubscoreKey } from "./config";
import type { PlayerOvr } from "./store";

const { standout, strong, solid } = ARCHETYPE_THRESHOLDS;

export interface ArchetypeContext {
  positionGroup: PositionGroup;
  secondaryPositionGroup: PositionGroup | null;
  subscores: Record<SubscoreKey, number | null>;
}

/** "all" = gäller alla utespelare. Målvaktsarketyper anges med "GK". */
export type ArchetypeScope = PositionGroup | "all" | "outfield";

export interface ArchetypeDefinition {
  key: string;
  /** Kort, vardagligt namn — Scouts princip om enkelt språk, inte engelsk jargong. */
  label: string;
  definition: string;
  appliesTo: ArchetypeScope;
  test: (ctx: ArchetypeContext) => boolean;
  /** Vilka tal som avgjorde matchningen — visas i "varför?"-vyn. */
  reason: (ctx: ArchetypeContext) => string;
}

function sub(ctx: ArchetypeContext, key: SubscoreKey): number | null {
  return ctx.subscores[key];
}

/** Alla angivna delbetyg finns och når tröskeln. Saknat delbetyg = inte matchad. */
function all(ctx: ArchetypeContext, threshold: number, keys: SubscoreKey[]): boolean {
  return keys.every((k) => {
    const v = sub(ctx, k);
    return v !== null && v >= threshold;
  });
}

function atLeast(ctx: ArchetypeContext, key: SubscoreKey, threshold: number): boolean {
  const v = sub(ctx, key);
  return v !== null && v >= threshold;
}

function show(ctx: ArchetypeContext, labels: [SubscoreKey, string][]): string {
  return labels
    .map(([key, label]) => `${label} ${sub(ctx, key)?.toFixed(1) ?? "—"}`)
    .join(", ");
}

export const ARCHETYPES: ArchetypeDefinition[] = [
  // ---------------------------------------------------------------------------
  // Spetsförmågor — gäller alla utespelare
  // ---------------------------------------------------------------------------
  {
    key: "malskytt",
    label: "Målskytt",
    definition: "Utmärker sig i avslutning — mål, skott på mål och målkonvertering — jämfört med andra på samma position.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "finishing", standout),
    reason: (ctx) => show(ctx, [["finishing", "Avslutning"]]),
  },
  {
    key: "spelfordelare",
    label: "Spelfördelare",
    definition: "Utmärker sig i passningsspel — säkerhet, volym och nyckelpassningar.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "passing", standout),
    reason: (ctx) => show(ctx, [["passing", "Passning"]]),
  },
  {
    key: "dribblare",
    label: "Dribblare",
    definition: "Utmärker sig i dribbling — lyckade dribblingar, träffsäkerhet och framspelade frisparkar.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "dribbling", standout),
    reason: (ctx) => show(ctx, [["dribbling", "Dribbling"]]),
  },
  {
    key: "bollvinnare",
    label: "Bollvinnare",
    definition: "Utmärker sig i försvarsarbete — tacklingar, brytningar och blockeringar.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "defending", standout),
    reason: (ctx) => show(ctx, [["defending", "Försvarsspel"]]),
  },
  {
    key: "duellspelare",
    label: "Duellspelare",
    definition: "Vinner sina dueller och gör det utan att samla på sig frisparkar och kort.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "duels", standout),
    reason: (ctx) => show(ctx, [["duels", "Duellspel"]]),
  },
  {
    key: "allround",
    label: "Allround-spelare",
    definition: "Ingen svag sida — bredd i stället för en enskild spetsförmåga.",
    appliesTo: "outfield",
    test: (ctx) => all(ctx, solid, ["finishing", "passing", "dribbling", "defending", "duels"]),
    reason: (ctx) =>
      show(ctx, [
        ["finishing", "Avslutning"],
        ["passing", "Passning"],
        ["dribbling", "Dribbling"],
        ["defending", "Försvar"],
        ["duels", "Duell"],
      ]),
  },
  {
    key: "progressiv_anfallsspelare",
    label: "Progressiv anfallsspelare",
    definition: "Bär bollen framåt själv och avslutar — stark dribbling kombinerad med avslutning.",
    appliesTo: "outfield",
    test: (ctx) => atLeast(ctx, "dribbling", strong) && atLeast(ctx, "finishing", solid),
    reason: (ctx) => show(ctx, [["dribbling", "Dribbling"], ["finishing", "Avslutning"]]),
  },

  // ---------------------------------------------------------------------------
  // Mittbackar — möjliga först med v2:s egna positionsgrupper
  // ---------------------------------------------------------------------------
  {
    key: "modern_mittback",
    label: "Modern mittback",
    definition: "Mittback som startar anfallen — stark passning utan att tumma på duellspelet.",
    appliesTo: "CB",
    test: (ctx) => atLeast(ctx, "passing", strong) && atLeast(ctx, "duels", solid),
    reason: (ctx) => show(ctx, [["passing", "Passning"], ["duels", "Duellspel"]]),
  },
  {
    key: "renodlad_forsvarare",
    label: "Renodlad försvarare",
    definition: "Mittback vars styrka är att försvara — dueller och brytningar, inte uppspel.",
    appliesTo: "CB",
    test: (ctx) => atLeast(ctx, "duels", strong) && atLeast(ctx, "defending", strong),
    reason: (ctx) => show(ctx, [["duels", "Duellspel"], ["defending", "Försvarsspel"]]),
  },

  // ---------------------------------------------------------------------------
  // Ytterbackar
  // ---------------------------------------------------------------------------
  {
    key: "offensiv_ytterback",
    label: "Offensiv ytterback",
    definition: "Ytterback som bidrar framåt — dribbling och nyckelpassningar från kanten.",
    appliesTo: "FB",
    test: (ctx) => atLeast(ctx, "dribbling", strong) || atLeast(ctx, "passing", strong),
    reason: (ctx) => show(ctx, [["dribbling", "Dribbling"], ["passing", "Passning"]]),
  },
  {
    key: "defensiv_ytterback",
    label: "Defensiv ytterback",
    definition: "Ytterback som först och främst håller tätt på sin kant.",
    appliesTo: "FB",
    test: (ctx) => atLeast(ctx, "defending", strong) && atLeast(ctx, "duels", solid),
    reason: (ctx) => show(ctx, [["defending", "Försvarsspel"], ["duels", "Duellspel"]]),
  },

  // ---------------------------------------------------------------------------
  // Centrala mittfältare
  // ---------------------------------------------------------------------------
  {
    key: "ankare",
    label: "Ankare",
    definition: "Defensiv mittfältare — bryter anfall och vinner andrabollar framför backlinjen.",
    appliesTo: "CM",
    test: (ctx) => atLeast(ctx, "defending", strong) && atLeast(ctx, "duels", solid),
    reason: (ctx) => show(ctx, [["defending", "Försvarsspel"], ["duels", "Duellspel"]]),
  },
  {
    key: "box_to_box",
    label: "Box-to-box",
    definition: "Mittfältare som täcker hela planen — bidrar både defensivt och framåt utan att vara svag någonstans.",
    appliesTo: "CM",
    test: (ctx) => all(ctx, solid, ["defending", "passing", "dribbling"]) && atLeast(ctx, "duels", solid),
    reason: (ctx) =>
      show(ctx, [["defending", "Försvar"], ["passing", "Passning"], ["dribbling", "Dribbling"], ["duels", "Duell"]]),
  },
  {
    key: "djupledsspelare",
    label: "Djupledsspelare",
    definition:
      "Central mittfältare som löser press med passningen snarare än med kroppen — starkt passningsspel utan att vara en duellvinnare.",
    appliesTo: "CM",
    // Kravet på att INTE vara stark i duellspel är avsiktligt: utan det var
    // testet ordagrant identiskt med "Spelfördelare" och etiketten bar ingen
    // egen information för en mittfältare.
    test: (ctx) => atLeast(ctx, "passing", standout) && !atLeast(ctx, "duels", strong),
    reason: (ctx) => show(ctx, [["passing", "Passning"], ["duels", "Duellspel"]]),
  },

  // ---------------------------------------------------------------------------
  // Offensiva mittfältare och ytter
  // ---------------------------------------------------------------------------
  {
    key: "kreator",
    label: "Kreatör",
    definition: "Skapar lägen åt andra — nyckelpassningar och assist är hans tydligaste bidrag.",
    appliesTo: "AM",
    test: (ctx) => atLeast(ctx, "passing", strong),
    reason: (ctx) => show(ctx, [["passing", "Passning"]]),
  },
  {
    key: "malfarlig_ytter",
    label: "Målfarlig ytter",
    definition: "Ytter som både tar sig förbi sin back och avslutar själv.",
    appliesTo: "AM",
    test: (ctx) => atLeast(ctx, "dribbling", strong) && atLeast(ctx, "finishing", strong),
    reason: (ctx) => show(ctx, [["dribbling", "Dribbling"], ["finishing", "Avslutning"]]),
  },

  // ---------------------------------------------------------------------------
  // Anfallare
  // ---------------------------------------------------------------------------
  {
    key: "boxanfallare",
    label: "Boxanfallare",
    definition: "Avslutare i straffområdet — stark i avslutning och i duellerna med backarna.",
    appliesTo: "ST",
    test: (ctx) => atLeast(ctx, "finishing", strong) && atLeast(ctx, "duels", strong),
    reason: (ctx) => show(ctx, [["finishing", "Avslutning"], ["duels", "Duellspel"]]),
  },
  {
    key: "rorlig_anfallare",
    label: "Rörlig anfallare",
    definition: "Anfallare som rör sig ut ur boxen — dribblar och deltar i uppspelet.",
    appliesTo: "ST",
    test: (ctx) => atLeast(ctx, "dribbling", strong) && atLeast(ctx, "passing", solid),
    reason: (ctx) => show(ctx, [["dribbling", "Dribbling"], ["passing", "Passning"]]),
  },

  // ---------------------------------------------------------------------------
  // Målvakter
  // ---------------------------------------------------------------------------
  {
    key: "raddare",
    label: "Räddare",
    definition: "Målvakt som utmärker sig på räddningar, hållna nollor och insläppta mål.",
    appliesTo: "GK",
    test: (ctx) => atLeast(ctx, "goalkeeping", standout),
    reason: (ctx) => show(ctx, [["goalkeeping", "Målvaktsspel"]]),
  },
  {
    key: "fotbollsspelande_malvakt",
    label: "Fotbollsspelande målvakt",
    definition: "Målvakt som är en tillgång i uppspelet — hög passningssäkerhet och volym.",
    appliesTo: "GK",
    test: (ctx) => atLeast(ctx, "passing", strong),
    reason: (ctx) => show(ctx, [["passing", "Utspel"]]),
  },
];

export interface MatchedArchetype {
  key: string;
  label: string;
  definition: string;
  reason: string;
}

function inScope(scope: ArchetypeScope, group: PositionGroup): boolean {
  if (scope === "all") return true;
  if (scope === "outfield") return group !== "GK";
  return scope === group;
}

/**
 * Alla arketyper en spelare matchar. Returnerar ALLTID en array — tom när inget
 * matchar eller när underlaget är för tunt.
 *
 * Kräver minst medelkonfidens. En arketypstämpel bygger på delbetyg som för en
 * spelare med 90 minuter nästan helt är shrinkage mot historiken; att kalla det
 * "Boxanfallare" vore att stämpla vårt eget antagande som ett observerat mönster.
 */
export function computePlayerArchetypes(ctx: ArchetypeContext, confidenceTier: string | null): MatchedArchetype[] {
  if (confidenceTier === "låg" || confidenceTier === null) return [];

  const matched: { archetype: ArchetypeDefinition; result: MatchedArchetype }[] = [];
  for (const archetype of ARCHETYPES) {
    if (!inScope(archetype.appliesTo, ctx.positionGroup)) continue;
    if (!archetype.test(ctx)) continue;
    matched.push({
      archetype,
      result: {
        key: archetype.key,
        label: archetype.label,
        definition: archetype.definition,
        reason: archetype.reason(ctx),
      },
    });
  }

  // Positionsspecifika arketyper först. "Modern mittback" säger mer om en
  // spelare än "Spelfördelare", och en riktigt bra spelare matchar gärna
  // ett halvdussin — då ska de mest informativa ligga överst så att ett UI
  // kan visa de tre första utan att tappa det viktigaste.
  matched.sort((a, b) => {
    const specific = (d: ArchetypeDefinition) => (d.appliesTo === "outfield" || d.appliesTo === "all" ? 1 : 0);
    return specific(a.archetype) - specific(b.archetype);
  });
  return matched.map((m) => m.result);
}

/** Bekvämlighet: arketyper direkt ur ett läst betyg. */
export function archetypesForRating(rating: PlayerOvr): MatchedArchetype[] {
  return computePlayerArchetypes(
    {
      positionGroup: rating.positionGroup,
      secondaryPositionGroup: rating.secondaryPositionGroup,
      subscores: rating.subscores,
    },
    rating.confidenceTier
  );
}
