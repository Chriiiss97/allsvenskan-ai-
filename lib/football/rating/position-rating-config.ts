import type { RatingCategoryKey } from "./metric-registry";
import type { PositionGroupKey } from "../position-group";

/**
 * Player Rating — Level 4→5: vikter kategori-mot-kategori per positionsgrupp.
 *
 * UTTRYCKLIGEN expertbedömda vikter ovanpå empiriskt härledda percentiler —
 * INTE statistiskt anpassade (ingen regression mot t.ex. löner, marknads-
 * värden eller matchresultat finns bakom talen). De uttrycker en förenklad,
 * väl etablerad fotbollsförståelse av vad som är viktigast per positions-
 * grupp (en anfallare bedöms mest på avslutning, en försvarare mest på
 * försvarsspel) — samma sorts expertbedömda vikt EA:s eget FIFA/FC-system
 * historiskt byggt på, fast här applicerad på riktig, verifierad statistik
 * istället för scoutbedömningar. Motiveras och begränsas per grupp nedan.
 *
 * Målvakt hanteras INTE här — separat modell i goalkeeper-rating.ts (steg 4
 * i planen), egna mått (räddningsprocent/insläppta mål/clean sheets) som
 * inte finns i RATING_METRICS/categories.ts alls.
 *
 * Varje grupps vikter summerar till exakt 100 — verifierat av
 * assertWeightsSumTo100() nedan, som körs vid modul-load (fail fast om
 * någon framtida redigering råkar bryta summan).
 */

export interface PositionRatingWeights {
  weights: Record<RatingCategoryKey, number>;
  /** Varför just den här viktfördelningen — visas i "Varför 82?"-vyn. */
  rationale: string;
  /** Kända begränsningar i just den här positionsgruppens vikter/underlag. */
  limitations: string;
}

export const POSITION_RATING_CONFIG: Record<Exclude<PositionGroupKey, "goalkeeper">, PositionRatingWeights> = {
  attacker: {
    weights: { shooting: 40, dribbling: 25, passing: 20, defending: 15 },
    rationale:
      "En anfallares huvuduppgift är att avsluta — Avslutning väger därför tyngst. Dribbling (att skapa läge på egen hand) väger tyngre än för andra grupper. Försvarsspel väger minst men är inte noll — moderna anfallare pressar också.",
    limitations:
      "Ingen xG att skilja förtjänta från tursamma mål — Avslutning mäter volym (mål/skott/skott på mål), inte skottkvalitet.",
  },
  midfielder: {
    weights: { passing: 35, defending: 25, dribbling: 20, shooting: 20 },
    rationale:
      "En mittfältares huvuduppgift är att länka spelet — Passning väger tyngst. Försvarsspel och Dribbling väger nästan lika (box-to-box-rollen kräver båda). Avslutning väger minst men rörs inte till noll — många mittfältare avslutar regelbundet.",
    limitations:
      "Mittfältare är den bredaste positionsgruppen (defensiv/central/offensiv mittfältare särskiljs inte i källdatan) — vikterna är en kompromiss över hela spannet, inte skräddarsydda per undertyp.",
  },
  defender: {
    weights: { defending: 50, passing: 30, dribbling: 12, shooting: 8 },
    rationale:
      "En försvarares huvuduppgift är att förhindra mål — Försvarsspel väger tyngst, med god marginal. Passning (uppspel/utspel) väger som tvåa. Dribbling och Avslutning väger minst men är inte noll — moderna försvarare deltar i uppbyggnaden.",
    limitations:
      "duels_total/duels_won blandar mark-, luft- och dribblingsdueller (ingen uppdelning i källdatan) — Försvarsspel-kategorin kan alltså inte skilja en stark marktacklare från en stark luftduellspelare.",
  },
};

const OVR_CAP = 99;

function assertWeightsSumTo100() {
  for (const [group, config] of Object.entries(POSITION_RATING_CONFIG)) {
    const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      throw new Error(`position-rating-config.ts: vikterna för "${group}" summerar till ${sum}, inte 100.`);
    }
  }
}
assertWeightsSumTo100();

export interface OvrContribution {
  category: RatingCategoryKey;
  /** null om kategorin saknade underlag helt (inget mått hade data) — vikten omfördelas då INTE, se computeOvr. */
  score: number | null;
  weight: number;
  /** score * weight / 100, avrundat till en decimal — null om score är null. */
  contribution: number | null;
}

export interface OvrResult {
  /** Summan av alla tillgängliga bidrag, skalad upp om någon kategori saknades (se computeOvr), capad vid 99. */
  ovr: number | null;
  contributions: OvrContribution[];
  /** true om minst en kategori helt saknade underlag och vikten fick skalas om proportionellt. */
  hadMissingCategory: boolean;
}

/**
 * Level 5: kategori-percentiler → en enda OVR-siffra, spårbart steg för
 * steg. Ren viktad summa av percentiler, capad vid 99 — INGEN omskalad
 * kurva (t.ex. FIFA:s egen icke-linjära transform). Varje steg i "varför
 * 82?"-nedbrytningen (råvärde → percentil → × vikt → bidrag → summa) ska
 * vara självständigt räknebart för användaren; en dold kurva i slutet hade
 * brutit det.
 *
 * Om en kategori helt saknar underlag (t.ex. en försvarare med noll
 * registrerade skott — inget ovanligt) skalas de KVARVARANDE vikterna
 * proportionellt upp så de fortfarande summerar till 100, istället för att
 * tyst räkna den saknade kategorin som 0 (vilket orättvist skulle sänka
 * OVR för något spelaren aldrig försökt göra).
 */
export function computeOvr(
  group: Exclude<PositionGroupKey, "goalkeeper">,
  categoryScores: Record<RatingCategoryKey, number | null>
): OvrResult {
  const config = POSITION_RATING_CONFIG[group];
  const available = (Object.entries(config.weights) as [RatingCategoryKey, number][]).filter(
    ([key]) => categoryScores[key] !== null
  );
  const availableWeightSum = available.reduce((a, [, w]) => a + w, 0);
  const hadMissingCategory = availableWeightSum < 100;

  const contributions: OvrContribution[] = (Object.entries(config.weights) as [RatingCategoryKey, number][]).map(
    ([category, weight]) => {
      const score = categoryScores[category];
      if (score === null || availableWeightSum === 0) {
        return { category, score: null, weight, contribution: null };
      }
      // Proportionell omskalning: vikten normaliseras mot summan av bara de
      // TILLGÄNGLIGA kategoriernas vikter, inte den nominella 100.
      const effectiveWeight = (weight / availableWeightSum) * 100;
      const contribution = Math.round(((score * effectiveWeight) / 100 + Number.EPSILON) * 10) / 10;
      return { category, score, weight, contribution };
    }
  );

  if (availableWeightSum === 0) {
    return { ovr: null, contributions, hadMissingCategory: true };
  }

  const sum = contributions.reduce((a, c) => a + (c.contribution ?? 0), 0);
  const ovr = Math.min(OVR_CAP, Math.round(sum));
  return { ovr, contributions, hadMissingCategory };
}
