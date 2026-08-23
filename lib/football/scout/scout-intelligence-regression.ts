import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { tierFromThresholds, type ConfidenceTier } from "../confidence";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Scout Intelligence #3 — Regression mot medelvärdet (RTM)
 * ============================================================================
 * Egen Scout Intelligence-fas (2026-08-22), inte Fas 14, inte OVR. Läser
 * ENBART det redan persisterade OVR-facit (player_ratings, skrivet
 * av refresh-ovr.ts) — skriver ALDRIG dit, ändrar ALDRIG OVR-formeln.
 *
 * FORMEL (härledd från användarens spec):
 *   Ŷ_nästa = Ȳ_karriär + r · (Y_nuvarande − Ȳ_karriär)
 * — Ȳ_karriär = spelarens EGNA genomsnittliga OVR över TIDIGARE säsonger
 * (INTE den nuvarande — annars mäter man delvis mot sig själv, cirkulärt).
 * Y_nuvarande = OVR den valda/senaste säsongen.
 *
 * r (REGRESSIONSKOEFFICIENTEN) ÄR INTE en gissning eller ett importerat
 * literaturvärde — den beräknas EMPIRISKT, live, från VARJE riktigt
 * (spelare, säsong t → säsong t+1)-par som finns i vår egen
 * player_ratings-historik (Pearson-korrelation mellan OVR år t och
 * OVR år t+1). VERIFIERAT vid byggtillfället: 2454 riktiga sådana par
 * (2016–2026), r ≈ 0.371 — ett r betydligt under 1 bekräftar att
 * regression mot medelvärdet FAKTISKT förekommer i den här ligans data
 * (inte antaget). r räknas om vid varje anrop (inte hårdkodat) så den
 * aldrig blir inaktuell när fler säsonger läggs till.
 *
 * MINIMIUNDERLAG: kräver ≥2 TIDIGARE säsonger (utöver den nuvarande) för
 * att ens visa en prognos — under det finns ingen meningsfull
 * "karriärbaslinje" att regrediera mot. Confidence: hög ≥4 tidigare
 * säsonger, medel ≥2 (EGNA, dokumenterade trösklar — verifierat: 714
 * spelare har ≥2 tidigare säsonger, 253 har ≥4, av hela 2016–2026-
 * populationen).
 *
 * TOLKNING — VIKTIGT: det här är en STATISTISK PROJEKTION baserad på hur
 * mycket OVR historiskt återgår mot spelarens eget snitt i den här
 * ligan — INTE en validerad prognos (vi har ingen 2027-data att testa
 * mot ännu, så "träffsäkerhet" kan inte anges). Tre lägen:
 *   - "regression_expected": nuvarande säsong ligger klart (≥3 OVR-poäng,
 *     samma TREND_THRESHOLD som rating-trend.ts) ÖVER karriärsnittet —
 *     prognosen pekar nedåt mot en mer normal nivå (den vanligaste
 *     användningen: identifiera en trolig "career year"-anomali innan man
 *     överbetalar för en spelare).
 *   - "improvement_expected": nuvarande säsong ligger klart UNDER
 *     karriärsnittet — prognosen pekar uppåt (spelaren kan vara på väg
 *     tillbaka mot sin normala nivå efter t.ex. en skadesäsong).
 *   - "sustained_level": ingen stor skillnad — nuvarande nivå ser ut som
 *     spelarens genuina normalläge, inte en tillfällig topp/dal.
 */

const MIN_PRIOR_SEASONS = 2;
const TREND_THRESHOLD = 3; // samma tröskel som rating-trend.ts

export interface RegressionPrediction {
  available: boolean;
  unavailableReason?: string;
  currentSeasonYear: number;
  currentOvr: number;
  careerMeanPriorSeasons: number;
  priorSeasonCount: number;
  predictedNextOvr: number;
  direction: "regression_expected" | "improvement_expected" | "sustained_level";
  confidence: ConfidenceTier;
}

export interface RegressionToMeanBatch {
  /** Empiriskt Pearson-r, beräknat live från alla riktiga (t, t+1)-OVR-par i databasen — se filhuvudet. */
  regressionCoefficient: number;
  pairsUsedForR: number;
  results: Map<number, RegressionPrediction>;
}

interface RatingRow {
  player_id: number;
  ovr: number | null;
  season_year: number;
}

/**
 * Batch för HELA ligan, en given "nuvarande" säsong (default: senaste
 * tillgängliga med facit). Samma "läs en gång, slå upp per spelare"-
 * princip som resten av Scout Intelligence-lagret.
 */
export async function computeRegressionToMean(
  supabase: Supabase,
  params: { currentSeasonYear: number }
): Promise<RegressionToMeanBatch> {
  // (Ingen .not("ovr", ...)-filtrering i frågan — null-kollas ändå i loopen
  // nedan, och en extra filter-overload på den här embedded-select-formen
  // fick Supabase-js:s typinferens att kollapsa till `never`.)
  //
  // Sidnumrerad — player_ratings har ~4 700+ rader med ovr != null
  // över 2016–2026, långt över Supabases 1000-radstak. FÅNGAD UNDER
  // VERIFIERING: en första, opaginerad version tystade ner till bara 1000
  // rader, vilket halverade det empiriska r:et (0.371 → 0.237 i ett
  // sidnumrerat kontra opaginerat test av samma data) — exakt den kända,
  // återkommande fallgropen redan dokumenterad flera gånger i det här
  // projektet, fångad här innan den skeppades.
  const data: RatingRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("player_ratings")
      // season_year finns direkt på raden i player_ratings — ingen join behövs.
      .select("player_id, ovr, season_year")
      .range(from, from + PAGE - 1)
      .returns<RatingRow[]>();
    if (error) throw error;
    data.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }

  const byPlayerYear = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.ovr === null) continue;
    // ovr är numeric i databasen och kommer tillbaka som sträng via PostgREST.
    byPlayerYear.set(`${r.player_id}_${r.season_year}`, Number(r.ovr));
  }

  // 1) Empiriskt r — Pearson-korrelation över ALLA riktiga (år t, år t+1)-par i hela datasetet (inte scopat till currentSeasonYear).
  const pairs: [number, number][] = [];
  for (const [key, ovrT] of byPlayerYear) {
    const [playerIdStr, yearStr] = key.split("_");
    const year = Number(yearStr);
    const next = byPlayerYear.get(`${playerIdStr}_${year + 1}`);
    if (next !== undefined) pairs.push([ovrT, next]);
  }
  const regressionCoefficient = pairs.length >= 30 ? pearsonR(pairs) : 0; // <30 par: för litet underlag för ett tillförlitligt r, faller tillbaka på r=0 (full regression, den konservativa gissningen)

  // 2) Per spelare: karriärsnitt över TIDIGARE säsonger (år < currentSeasonYear), prognos för currentSeasonYear+1.
  const priorSeasonsByPlayer = new Map<number, number[]>();
  const currentByPlayer = new Map<number, number>();
  for (const [key, ovr] of byPlayerYear) {
    const [playerIdStr, yearStr] = key.split("_");
    const playerId = Number(playerIdStr);
    const year = Number(yearStr);
    if (year === params.currentSeasonYear) {
      currentByPlayer.set(playerId, ovr);
    } else if (year < params.currentSeasonYear) {
      const arr = priorSeasonsByPlayer.get(playerId) ?? [];
      arr.push(ovr);
      priorSeasonsByPlayer.set(playerId, arr);
    }
  }

  const results = new Map<number, RegressionPrediction>();
  for (const [playerId, currentOvr] of currentByPlayer) {
    const priorSeasons = priorSeasonsByPlayer.get(playerId) ?? [];
    if (priorSeasons.length < MIN_PRIOR_SEASONS) continue; // available:false hanteras av anroparen (spelaren finns inte i Map:en alls)

    const careerMean = priorSeasons.reduce((a, b) => a + b, 0) / priorSeasons.length;
    const predicted = careerMean + regressionCoefficient * (currentOvr - careerMean);
    const diff = predicted - currentOvr;
    const direction: RegressionPrediction["direction"] =
      diff <= -TREND_THRESHOLD ? "regression_expected" : diff >= TREND_THRESHOLD ? "improvement_expected" : "sustained_level";

    results.set(playerId, {
      available: true,
      currentSeasonYear: params.currentSeasonYear,
      currentOvr,
      careerMeanPriorSeasons: Math.round(careerMean * 10) / 10,
      priorSeasonCount: priorSeasons.length,
      predictedNextOvr: Math.round(predicted * 10) / 10,
      direction,
      confidence: tierFromThresholds(priorSeasons.length, 4, 2),
    });
  }

  return { regressionCoefficient: Math.round(regressionCoefficient * 1000) / 1000, pairsUsedForR: pairs.length, results };
}

function pearsonR(pairs: [number, number][]): number {
  const n = pairs.length;
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let cov = 0, varX = 0, varY = 0;
  for (const [x, y] of pairs) {
    cov += (x - meanX) * (y - meanY);
    varX += (x - meanX) ** 2;
    varY += (y - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}
