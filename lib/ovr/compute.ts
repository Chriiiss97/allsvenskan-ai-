/**
 * OVR v2 — beräkningskärnan.
 * =============================================================================
 * RENA FUNKTIONER. Ingen databas, ingen I/O, ingen tid, ingen slump. Allt som
 * behövs kommer in som argument, allt som produceras kommer ut som returvärde.
 * Det är därför hela motorn går att unit-testa utan att starta någonting.
 *
 * All konfiguration (vikter, ankarpunkter, k-värden, ålderskurva) läses från
 * config.ts. Det finns med flit inga magiska tal i den här filen.
 *
 * -----------------------------------------------------------------------------
 * PIPELINE
 * -----------------------------------------------------------------------------
 *   1. Råvärden -> per 90 / kvoter          (görs i aggregate.ts, inte här)
 *   2. Percentil inom positionsgrupp        percentileOf
 *   3. Prior ur historiken, i percentilrum  buildPrior
 *   4. Shrinkage per MÄTVÄRDE mot prior     shrinkToPrior
 *   5. Vikta ihop till en komposit          compositeScore
 *   6. RE-RANKA kompositen inom gruppen     rankComposites   <-- se nedan
 *   7. Ankarmappa percentilen till 0–100    anchorToOvr
 *
 * -----------------------------------------------------------------------------
 * VARFÖR STEG 6 FINNS (avsteg från specen, medvetet)
 * -----------------------------------------------------------------------------
 * Specen säger "vikta ihop percentilerna till en samlad percentil". Men ett
 * viktat medelvärde av percentiler ÄR INTE en percentil. Medelvärdet av flera
 * ungefär likformiga variabler drar ihop sig mot mitten — centrala
 * gränsvärdessatsen — så en spelare som ligger på p90 i tre mått och p60 i tre
 * andra får kompositen ~75, och NÄSTAN ALLA hamnar mellan 40 och 60. Mappar man
 * det rakt genom ankarpunkterna klumpas hela ligan ihop runt 68.
 *
 * Det är exakt den låga spridning som var skälet att bygga om motorn. Därför
 * rankas kompositen om inom positionsgruppen innan ankarmappningen: det är
 * rangordningen som är signalen, och ankarpunkterna får då den spridning de
 * var designade för.
 *
 * -----------------------------------------------------------------------------
 * VARFÖR PRIOR RÄKNAS I PERCENTILRUM
 * -----------------------------------------------------------------------------
 * Källdatans definitioner ändrar sig över tid (se de tre datasanningarna i
 * config.ts). Tacklingar per 90 steg +70 % mellan 2019 och 2025 utan att
 * fotbollen ändrades. Ett prior byggt på råa per-90-tal skulle alltså tro att
 * varenda spelare blivit dubbelt så bra på att tackla.
 *
 * "Han låg på 82:a percentilen bland mittbackar 2019" är däremot sant oavsett
 * hur fältet råkade mätas det året — rangordningen inom en säsong påverkas inte
 * av att alla mäts med samma nya måttstock. Prior byggs därför uteslutande av
 * percentiler, aldrig av råvärden.
 */

import {
  AGE_CURVE,
  AGE_PEAK,
  CONFIG_VERSION,
  FORM_RANGE,
  LEAGUE_Z_PER_LOG_COEFFICIENT,
  METRICS,
  MIN_PEERS_PER_GROUP,
  NEUTRAL_PRIOR_K_FACTOR,
  NEUTRAL_PRIOR_PERCENTILE,
  OVR_CAP,
  OVR_FLOOR,
  POSITION_WEIGHTS,
  PRIOR_FULL_WEIGHT_MINUTES,
  SCALE_ANCHORS,
  SEASON_WEIGHTS,
  STABILISATION,
  SUBSCORE_KEYS,
  SUBSCORE_WEIGHTS,
  UNRATED_CONFIDENCE_PENALTY,
  confidenceTier,
  type ConfidenceTier,
  type MetricKey,
  type PositionGroup,
  type SubscoreKey,
} from "./config";

// =============================================================================
// 1. Grundläggande statistik
// =============================================================================

/**
 * Percentilrang 0–100 med mittrang vid lika värden.
 *
 * Mittrang (below + equal/2) i stället för "andel under" gör att den ende
 * bästa spelaren i en grupp om n hamnar på (n - 0,5)/n, inte på 100. Det är
 * avsiktligt: ett stickprov om 29 målvakter kan inte belägga att någon tillhör
 * ligans översta promille, och skalan ska inte låtsas det.
 *
 * @param sortedAsc Stigande sorterade peer-värden, redan orienterade så att
 *                  högre alltid är bättre (se orientValue).
 */
export function percentileOf(sortedAsc: readonly number[], value: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;

  // Binärsökning efter första index >= value och första index > value.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;

  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const equal = lo - below;

  return ((below + equal / 2) / n) * 100;
}

/**
 * Vänder måttet så att högre alltid betyder bättre. Kort, insläppta mål,
 * offsides och begångna frisparkar negeras. Måste tillämpas på BÅDE
 * referensfördelningen och spelarens eget värde — annars blir percentilen
 * spegelvänd, vilket är precis den sortens fel som aldrig syns i ett medelvärde.
 */
export function orientValue(metric: MetricKey, value: number): number {
  return METRICS[metric].higherIsBetter ? value : -value;
}

/** Standardnormalens fördelningsfunktion — Abramowitz & Stegun 7.1.26. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inversen av normalCdf — Acklams approximation, noggrann till ~1e-9. */
export function normalQuantile(p: number): number {
  const pClamped = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (pClamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(pClamped));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (pClamped > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - pClamped));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = pClamped - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// =============================================================================
// 2. Skalan
// =============================================================================

/**
 * Percentil (0–100) -> OVR, styckevis linjärt mellan ankarpunkterna i
 * config.SCALE_ANCHORS. Monoton per konstruktion; utanför yttersta ankarna
 * interpoleras mot golv respektive tak.
 */
export function anchorToOvr(percentile: number): number {
  const p = Math.min(Math.max(percentile, 0), 100);
  const first = SCALE_ANCHORS[0];
  const last = SCALE_ANCHORS[SCALE_ANCHORS.length - 1];

  if (p <= first.percentile) {
    const t = p / first.percentile;
    return round1(OVR_FLOOR + t * (first.ovr - OVR_FLOOR));
  }
  if (p >= last.percentile) {
    const span = 100 - last.percentile;
    const t = span <= 0 ? 1 : (p - last.percentile) / span;
    return round1(last.ovr + t * (OVR_CAP - last.ovr));
  }
  for (let i = 1; i < SCALE_ANCHORS.length; i++) {
    const hi = SCALE_ANCHORS[i];
    const lo = SCALE_ANCHORS[i - 1];
    if (p <= hi.percentile) {
      const t = (p - lo.percentile) / (hi.percentile - lo.percentile);
      return round1(lo.ovr + t * (hi.ovr - lo.ovr));
    }
  }
  return round1(last.ovr);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// =============================================================================
// 3. Shrinkage
// =============================================================================

/**
 * Empirisk bayesiansk shrinkage (specens 4.1):
 *
 *     justerat = (observerat * n + prior * k) / (n + k)
 *
 * n = spelade 90-minutersekvivalenter innevarande säsong.
 * k = stabiliseringskonstant för mätvärdestypen (config.STABILISATION).
 *
 * Saknas prior returneras det observerade orört — men anroparen ska då sänka
 * confidence, för ett obeprövat värde är inte samma sak som ett stabiliserat.
 * Saknas det observerade returneras prior rakt av.
 */
export function shrinkToPrior(observed: number | null, prior: number | null, n90: number, k: number): number | null {
  if (observed === null && prior === null) return null;
  if (prior === null) return observed;
  if (observed === null) return prior;
  const n = Math.max(0, n90);
  return (observed * n + prior * k) / (n + k);
}

/** Hur stor andel av det justerade värdet som kommer från historiken. */
export function priorShare(n90: number, k: number): number {
  const n = Math.max(0, n90);
  return k / (n + k);
}

// =============================================================================
// 4. Ålder och liganivå
// =============================================================================

/** Linjärt interpolerad ålderseffekt i OVR-enheter. Utanför kurvan: närmaste ändpunkt. */
export function ageAdjustment(age: number | null): number {
  if (age === null || !Number.isFinite(age)) return 0;
  if (age <= AGE_CURVE[0].age) return AGE_CURVE[0].adjustment;
  const lastPoint = AGE_CURVE[AGE_CURVE.length - 1];
  if (age >= lastPoint.age) return lastPoint.adjustment;
  for (let i = 1; i < AGE_CURVE.length; i++) {
    const hi = AGE_CURVE[i];
    const lo = AGE_CURVE[i - 1];
    if (age <= hi.age) {
      const t = (age - lo.age) / (hi.age - lo.age);
      return lo.adjustment + t * (hi.adjustment - lo.adjustment);
    }
  }
  return 0;
}

/** Ålder i hela år vid en given referenstidpunkt. */
export function ageAt(birthDate: string | null, reference: Date): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  let age = reference.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

/**
 * Översätter en percentil uppmätt mot ALLSVENSK referensfördelning till vad
 * samma prestation är värd när den utfördes i en annan liga.
 *
 * Görs i z-rum, inte i percentilrum: percentiler är komprimerade i ändarna, så
 * ett påslag i procentenheter skulle flytta en medianspelare mycket mer än en
 * toppspelare. En förskjutning av den underliggande normalfördelningen gör
 * rätt sak i hela spannet.
 *
 * Exempel med LEAGUE_Z_PER_LOG_COEFFICIENT = 1,6:
 *   Premier League (1,55): p50 -> p76
 *   Superettan (0,70):     p90 -> p76
 */
export function leagueAdjustPercentile(percentile: number, coefficient: number): number {
  // En ogiltig koefficient ska aldrig nå hit — leagueUsability släpper bara
  // igenom ligor med en verifierad siffra. Neutral 1.0 som sista skydd.
  const coef = coefficient > 0 ? coefficient : 1;
  if (coef === 1) return percentile;
  const z = normalQuantile(percentile / 100);
  const shifted = z + LEAGUE_Z_PER_LOG_COEFFICIENT * Math.log(coef);
  return Math.min(Math.max(normalCdf(shifted) * 100, 0), 100);
}

// =============================================================================
// 5. Referensfördelningar
// =============================================================================

export interface PeerObservation {
  positionGroup: PositionGroup;
  metrics: Partial<Record<MetricKey, number | null>>;
}

/** positionsgrupp -> mått -> stigande sorterade, orienterade peer-värden. */
export type ReferenceDistributions = Partial<Record<PositionGroup, Partial<Record<MetricKey, number[]>>>>;

/**
 * Bygger referensfördelningarna. Anroparen bestämmer vilka observationer som
 * ingår — normalt spelare över PEER_MIN_MINUTES från REFERENCE_POOL_SEASONS
 * säsonger, så att små grupper (GK: 20–29 per säsong) får en tillräckligt tät
 * fördelning för att percentilen ska betyda något.
 */
export function buildReferenceDistributions(peers: readonly PeerObservation[]): ReferenceDistributions {
  const out: ReferenceDistributions = {};
  for (const peer of peers) {
    const byMetric = (out[peer.positionGroup] ??= {});
    for (const [key, value] of Object.entries(peer.metrics) as [MetricKey, number | null][]) {
      if (value === null || value === undefined || !Number.isFinite(value)) continue;
      (byMetric[key] ??= []).push(orientValue(key, value));
    }
  }
  for (const byMetric of Object.values(out)) {
    for (const values of Object.values(byMetric)) {
      (values as number[]).sort((a, b) => a - b);
    }
  }
  return out;
}

/** Percentilen för ett råvärde inom en positionsgrupp. null om underlaget är för tunt. */
export function metricPercentile(
  distributions: ReferenceDistributions,
  group: PositionGroup,
  metric: MetricKey,
  value: number | null
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const values = distributions[group]?.[metric];
  if (!values || values.length < MIN_PEERS_PER_GROUP) return null;
  return percentileOf(values, orientValue(metric, value));
}

/**
 * Väger ihop det som faktiskt spelats den här säsongen — allsvenska minuter
 * plus eventuella minuter utanför Allsvenskan — till EN observerad percentil
 * per mätvärde.
 *
 * Viktningen är REN MINUTVIKT. En match i MLS räknas varken mer eller mindre
 * än en allsvensk match; den enda skillnaden är att prestationen först
 * översätts till allsvensk nivå via ligakoefficienten, precis som i prior.
 * Samma säsong ger alltså ingen egen bonus — bara den speltid den är värd.
 *
 * Returnerar också hur många minuter som ligger bakom varje mått, eftersom de
 * skiljer sig: vi kan ha 466 minuters underlag om spelarens målskytte men bara
 * 235 om hans duellspel, när de utländska minuterna bara täcker fyra mått.
 * Shrinkage och confidence ska följa det faktiska underlaget, inte ett snitt.
 */
export function blendObservedPercentile(
  distributions: ReferenceDistributions,
  group: PositionGroup,
  metric: MetricKey,
  domesticValue: number | null | undefined,
  domesticMinutes: number,
  external: readonly ExternalStint[]
): { percentile: number | null; minutes: number } {
  let weighted = 0;
  let weight = 0;

  const domestic = metricPercentile(distributions, group, metric, domesticValue ?? null);
  if (domestic !== null && domesticMinutes > 0) {
    weighted += domestic * domesticMinutes;
    weight += domesticMinutes;
  }

  for (const stint of external) {
    if (stint.minutes <= 0) continue;
    const base = metricPercentile(distributions, group, metric, stint.per90[metric] ?? null);
    if (base === null) continue;
    weighted += leagueAdjustPercentile(base, stint.leagueCoefficient) * stint.minutes;
    weight += stint.minutes;
  }

  if (weight <= 0) return { percentile: null, minutes: 0 };
  return { percentile: weighted / weight, minutes: weight };
}

// =============================================================================
// 6. Prior ur historiken
// =============================================================================

/**
 * En historisk säsong. Två helt olika underlag ryms i samma typ, för att de
 * bidrar till prior på olika sätt:
 *
 *  - source "allsvenskan": vi har FULL statistik och kan ge en riktig percentil
 *    per mått, uppmätt inom rätt positionsgrupp det året.
 *  - source "foreign": player_career_stint ger BARA matcher, minuter, mål,
 *    assist och kort. Inga dueller, passningar, tacklingar eller dribblingar
 *    finns för utländska ligor — det är källans gräns, inte ett importfel.
 *    Sådana säsonger bidrar därför bara till de mått de faktiskt täcker.
 */
export interface HistorySeason {
  seasonYear: number;
  minutes: number;
  source: "allsvenskan" | "foreign";
  leagueCoefficient: number;
  leagueName?: string;
  clubId?: number | null;
  /** source "allsvenskan": färdiga percentiler inom rätt grupp och säsong. */
  percentiles?: Partial<Record<MetricKey, number | null>>;
  /** source "foreign": råa per-90-värden, percentileras mot allsvensk referens. */
  rawPer90?: Partial<Record<MetricKey, number | null>>;
}

/**
 * En sejour utanför Allsvenskan under den säsong som betygsätts.
 *
 * Bidrar bara till de mått player_career_stint faktiskt täcker — mål, assist,
 * mål+assist och kort. Dueller, passningar, tacklingar och dribblingar finns
 * inte för utländska ligor och fylls inte i med en proxy.
 */
export interface ExternalStint {
  leagueExternalId: number;
  leagueName: string;
  leagueCoefficient: number;
  minutes: number;
  per90: Partial<Record<MetricKey, number | null>>;
}

/**
 * En sejour vi VET om men inte kan värdera: cup, träningsmatch, ungdomsserie
 * eller en serie utan verifierad ligakoefficient.
 *
 * Den påverkar inte betyget med en enda decimal. Den finns i utdatan för att
 * luckan ska vara synlig — "spelaren har 889 minuter i J1 League som vi inte
 * kan väga in" är ett ärligare besked än att tyst applicera en gissad
 * koefficient, och det är ett bättre underlag för att prioritera kalibrering.
 */
export interface UnratedStint {
  leagueExternalId: number;
  leagueName: string;
  seasonYear: number;
  minutes: number;
  reason: "cup" | "friendly" | "youth" | "no_coefficient" | "unknown_league";
}

export interface PriorContribution {
  seasonYear: number;
  source: "allsvenskan" | "foreign";
  leagueName?: string;
  leagueCoefficient: number;
  minutes: number;
  weight: number;
  metrics: MetricKey[];
}

export interface PriorResult {
  /** Prior per mått, i percentilrum. */
  percentiles: Partial<Record<MetricKey, number>>;
  /** Summerad vikt per mått — visar hur väl underbyggt just det måttets prior är. */
  weightByMetric: Partial<Record<MetricKey, number>>;
  contributions: PriorContribution[];
}

/**
 * Bygger prior enligt specens 4.2:
 *
 *     prior = Σ(w_säsong * metrik_säsong * ligakoefficient) / Σ(w_säsong)
 *
 * med tre tillägg som specen inte nämner men som datan kräver:
 *
 *  1. Allt sker i percentilrum (se filhuvudet).
 *  2. Ligakoefficienten tillämpas som en förskjutning i z-rum, inte som en
 *     multiplikation av percentilen — att gånga en percentil med 1,55 är
 *     matematiskt meningslöst (p70 * 1,55 = p108).
 *  3. Säsongsvikten skalas med minuter upp till PRIOR_FULL_WEIGHT_MINUTES.
 *     Utan det väger en inhoppssäsong på 150 minuter lika tungt som en hel
 *     säsong på 2 500, och prior blir lika brusig som det den ska stabilisera.
 *
 * Prior spänner ALLTID över alla klubbar (specens 4.4) — det är hela poängen
 * med den. Klubbfiltret gäller bara form, aldrig historik.
 */
export function buildPrior(
  history: readonly HistorySeason[],
  ratingSeason: number,
  distributions: ReferenceDistributions,
  group: PositionGroup
): PriorResult {
  const weightedSum: Partial<Record<MetricKey, number>> = {};
  const weightTotal: Partial<Record<MetricKey, number>> = {};
  const contributions: PriorContribution[] = [];

  for (const season of history) {
    const seasonsBack = ratingSeason - season.seasonYear;
    if (seasonsBack < 1 || seasonsBack > SEASON_WEIGHTS.length) continue;

    const recencyWeight = SEASON_WEIGHTS[seasonsBack - 1];
    const minutesWeight = Math.min(1, Math.max(0, season.minutes) / PRIOR_FULL_WEIGHT_MINUTES);
    const weight = recencyWeight * minutesWeight;
    if (weight <= 0) continue;

    const touched: MetricKey[] = [];

    if (season.source === "allsvenskan" && season.percentiles) {
      for (const [key, percentile] of Object.entries(season.percentiles) as [MetricKey, number | null][]) {
        if (percentile === null || percentile === undefined || !Number.isFinite(percentile)) continue;
        const adjusted = leagueAdjustPercentile(percentile, season.leagueCoefficient);
        weightedSum[key] = (weightedSum[key] ?? 0) + weight * adjusted;
        weightTotal[key] = (weightTotal[key] ?? 0) + weight;
        touched.push(key);
      }
    } else if (season.source === "foreign" && season.rawPer90) {
      // Utländska stints saknar egen peer-pool — vi har inte de andra spelarna
      // i Eredivisie. Prestationen mäts därför mot ALLSVENSK fördelning
      // ("vilken percentil hade den här måltakten gett i Allsvenskan?") och
      // justeras sedan för liganivån. Det är en översättning, inte ett påhitt,
      // och den är explicit i historical_evidence.
      for (const [key, value] of Object.entries(season.rawPer90) as [MetricKey, number | null][]) {
        const base = metricPercentile(distributions, group, key, value ?? null);
        if (base === null) continue;
        const adjusted = leagueAdjustPercentile(base, season.leagueCoefficient);
        weightedSum[key] = (weightedSum[key] ?? 0) + weight * adjusted;
        weightTotal[key] = (weightTotal[key] ?? 0) + weight;
        touched.push(key);
      }
    }

    if (touched.length > 0) {
      contributions.push({
        seasonYear: season.seasonYear,
        source: season.source,
        leagueName: season.leagueName,
        leagueCoefficient: season.leagueCoefficient,
        minutes: season.minutes,
        weight: round3(weight),
        metrics: touched,
      });
    }
  }

  const percentiles: Partial<Record<MetricKey, number>> = {};
  for (const key of Object.keys(weightedSum) as MetricKey[]) {
    const total = weightTotal[key] ?? 0;
    if (total > 0) percentiles[key] = (weightedSum[key] as number) / total;
  }
  return { percentiles, weightByMetric: weightTotal, contributions };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Åldersjusterar prior. Effekten är angiven i OVR-enheter (max ±4) och räknas
 * om till percentilenheter via ankarkurvans lokala lutning, så att ±4 OVR
 * betyder samma sak oavsett var på skalan spelaren ligger.
 */
export function ageAdjustPriorPercentile(percentile: number, age: number | null): number {
  const deltaOvr = ageAdjustment(age);
  if (deltaOvr === 0) return percentile;
  const baseOvr = anchorToOvr(percentile);
  const targetOvr = baseOvr + deltaOvr;
  return ovrToPercentile(targetOvr);
}

/** Inversen av anchorToOvr — behövs för att uttrycka en OVR-justering i percentilrum. */
export function ovrToPercentile(ovr: number): number {
  const first = SCALE_ANCHORS[0];
  const last = SCALE_ANCHORS[SCALE_ANCHORS.length - 1];
  if (ovr <= first.ovr) {
    const span = first.ovr - OVR_FLOOR;
    const t = span <= 0 ? 0 : (ovr - OVR_FLOOR) / span;
    return Math.max(0, t * first.percentile);
  }
  if (ovr >= last.ovr) {
    const span = OVR_CAP - last.ovr;
    const t = span <= 0 ? 0 : (ovr - last.ovr) / span;
    return Math.min(100, last.percentile + t * (100 - last.percentile));
  }
  for (let i = 1; i < SCALE_ANCHORS.length; i++) {
    const hi = SCALE_ANCHORS[i];
    const lo = SCALE_ANCHORS[i - 1];
    if (ovr <= hi.ovr) {
      const t = (ovr - lo.ovr) / (hi.ovr - lo.ovr);
      return lo.percentile + t * (hi.percentile - lo.percentile);
    }
  }
  return last.percentile;
}

// =============================================================================
// 7. Hopviktning
// =============================================================================

export interface CompositeResult {
  /** Viktat medelvärde av tillgängliga måttpercentiler. INTE en percentil — se filhuvudet. */
  score: number | null;
  /** Andel av positionsgruppens totalvikt som faktiskt hade underlag. */
  coverage: number;
  /** Vikt som omfördelades för att måttet saknade underlag. */
  missingWeight: number;
}

/**
 * Viktar ihop percentiler enligt en vikttabell. Mått utan underlag utgår och
 * deras vikt omfördelas proportionellt över de kvarvarande — hellre det än att
 * räkna ett saknat mått som noll, vilket hade straffat spelaren för en
 * datalucka i stället för för sitt spel.
 */
export function compositeScore(
  percentiles: Partial<Record<MetricKey, number | null>>,
  weights: Partial<Record<MetricKey, number>>
): CompositeResult {
  let weighted = 0;
  let used = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    total += weight;
    const p = percentiles[key];
    if (p === null || p === undefined || !Number.isFinite(p)) continue;
    weighted += weight * p;
    used += weight;
  }
  if (used <= 0) return { score: null, coverage: 0, missingWeight: total };
  return { score: weighted / used, coverage: used / total, missingWeight: total - used };
}

/**
 * Steg 6 i pipelinen: rangordnar kompositerna inom positionsgruppen och
 * returnerar en äkta percentil per spelare. Se filhuvudet för varför det här
 * steget inte får hoppas över.
 *
 * Referensen byggs bara av spelare som anroparen markerat som peers (normalt
 * över PEER_MIN_MINUTES), men ALLA spelare percentileras mot den — även den som
 * spelat 90 minuter. Annars skulle en handfull inhoppare kunna förskjuta hela
 * gruppens skala.
 */
export type CompositeReference = Map<PositionGroup, number[]>;

/**
 * Bygger EN referensfördelning per positionsgrupp ur peers kompositer.
 *
 * Att den byggs en gång och delas är hela poängen med punkt 2 nedan.
 */
export function buildCompositeReference(
  entries: readonly { group: PositionGroup; score: number | null; isPeer: boolean }[]
): CompositeReference {
  const reference: CompositeReference = new Map();
  for (const e of entries) {
    if (!e.isPeer || e.score === null) continue;
    const arr = reference.get(e.group) ?? [];
    arr.push(e.score);
    reference.set(e.group, arr);
  }
  for (const arr of reference.values()) arr.sort((a, b) => a - b);
  return reference;
}

/**
 * Percentilerar kompositer mot en FÄRDIG referensfördelning.
 *
 * -----------------------------------------------------------------------------
 * VARFÖR REFERENSEN MÅSTE DELAS (punkt 2)
 * -----------------------------------------------------------------------------
 * ovr, current_season_rating och historical_rating är tre vyer av samma
 * spelare och presenteras bredvid varandra. Tidigare rankades var och en mot
 * SIN EGEN fördelning — de shrinkade kompositerna för ovr, de observerade för
 * säsongsbetyget, prior-kompositerna för historiken. Tre olika måttstockar.
 *
 * Följden blev tal som inte gick att läsa ihop: en anfallare med 20 minuter
 * fick ovr 82,8 medan säsongsbetyget var 52,1 och historiken 73,8 — alltså
 * högre än båda, vilket är omöjligt för en sammanvägning av dem. Orsaken var
 * att prior-kompositerna är slätare (mindre brus) än de observerade och därför
 * har en annan spridning: samma poäng hamnar på olika percentil beroende på
 * vilken fördelning man råkar mäta mot.
 *
 * Med en gemensam referens är mappningen poäng -> percentil -> OVR monoton och
 * identisk för alla tre. Eftersom den shrinkade kompositen per mätvärde är en
 * konvex kombination av det observerade och prior, hamnar ovr då garanterat
 * mellan de andra två när samma mätvärden ligger bakom alla tre. Det är
 * verifierat i compute.test.ts.
 */
export function rankAgainstReference(
  reference: CompositeReference,
  entries: readonly { key: string | number; group: PositionGroup; score: number | null }[]
): Map<string | number, number | null> {
  const out = new Map<string | number, number | null>();
  for (const e of entries) {
    if (e.score === null) {
      out.set(e.key, null);
      continue;
    }
    const values = reference.get(e.group);
    if (!values || values.length < MIN_PEERS_PER_GROUP) {
      out.set(e.key, null);
      continue;
    }
    // Klamra in poängen i peer-poolens faktiska spann.
    //
    // Utan det kan en spelare som INTE är peer hamna utanför fördelningen och
    // få exakt percentil 0 eller 100 — alltså golvet eller taket på skalan.
    // Det inträffade i praktiken: en målvakt med 90 spelade minuter fick 91,0,
    // högre än både sitt eget säsongsbetyg och sin historik. En ren prior är
    // slätare än en komposit som blandar in brusiga observerade percentiler,
    // komprimeras därför inte mot mitten på samma sätt, och kan skjuta förbi
    // hela fältet.
    //
    // Klamringen påverkar inte peers (de ingår redan i referensen) och säger
    // det enda ärliga om en spelare med 90 minuter: han kan vara lika bra som
    // den bäste, men underlaget kan inte belägga att han är bättre.
    const clamped = Math.min(Math.max(e.score, values[0]), values[values.length - 1]);
    out.set(e.key, percentileOf(values, clamped));
  }
  return out;
}

/**
 * Bekvämlighet: bygger referensen ur samma lista och rankar mot den.
 * Använd bara när det är EN storhet som ska rangordnas — för flera jämförbara
 * storheter måste referensen delas, se rankAgainstReference.
 */
export function rankComposites(
  entries: readonly { key: string | number; group: PositionGroup; score: number | null; isPeer: boolean }[]
): Map<string | number, number | null> {
  return rankAgainstReference(buildCompositeReference(entries), entries);
}

// =============================================================================
// 8. Confidence
// =============================================================================

/**
 * Specens 4.6: confidence = n / (n + k_snitt).
 *
 * k_snitt är det viktade snittet av k-värdena för de mått som faktiskt användes
 * — inte ett fast tal. En anfallare bedöms på långsamt stabiliserande mått
 * (k = 15) och ska därför nå hög confidence senare än en mittback som bedöms på
 * dueller (k = 8). Det är rätt: vi VET mindre om anfallaren efter lika många
 * matcher.
 *
 * Multipliceras med täckningsgraden — ett betyg där halva vikten saknade
 * underlag är inte lika säkert som ett där allt fanns.
 */
export function computeConfidence(n90: number, weights: Partial<Record<MetricKey, number>>, coverage: number): number {
  let weightedK = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    weightedK += weight * STABILISATION[METRICS[key].stabilisation];
    totalWeight += weight;
  }
  const kMean = totalWeight > 0 ? weightedK / totalWeight : 10;
  const n = Math.max(0, n90);
  const base = n / (n + kMean);
  return Math.min(1, Math.max(0, base * Math.min(1, Math.max(0, coverage))));
}

// =============================================================================
// 9. Huvudingång
// =============================================================================

export interface PlayerSeasonInput {
  playerId: number;
  seasonYear: number;
  clubId: number | null;
  minutes: number;
  birthDate: string | null;
  positionGroup: PositionGroup;
  secondaryPositionGroup: PositionGroup | null;
  positionConfidence: number;
  /** Per-90-värden och kvoter för innevarande säsong, i nuvarande klubb-agnostisk form. */
  metrics: Partial<Record<MetricKey, number | null>>;
  /**
   * Matcher spelaren gjort UTANFÖR Allsvenskan under SAMMA säsong som betygsätts
   * — utländsk liga, lägre svensk division eller europaspel. Räknas som
   * OBSERVERAT underlag jämte de allsvenska minuterna, inte som historik.
   *
   * Utan detta är en spelare som gjorde halva året i MLS och andra halvan i
   * Allsvenskan bara "en spelare med få allsvenska minuter", och den fotboll
   * han faktiskt spelat i år är osynlig för betyget.
   */
  currentSeasonExternal: readonly ExternalStint[];
  /** Speltid vi känner till men inte kan värdera. Rör aldrig betyget, sänker confidence. */
  unratedStints: readonly UnratedStint[];
  history: readonly HistorySeason[];
  /**
   * Samma måttform som `metrics`, men bara de senaste FORM_MATCH_COUNT
   * matcherna i NUVARANDE klubb (specens 4.4). null om underlag saknas.
   */
  recentFormMetrics: Partial<Record<MetricKey, number | null>> | null;
  joinedClubDate: string | null;
}

export interface MetricBreakdown {
  metric: MetricKey;
  label: string;
  weight: number;
  rawValue: number | null;
  observedPercentile: number | null;
  priorPercentile: number | null;
  adjustedPercentile: number | null;
  k: number;
  priorShare: number;
  /** Minuter bakom just det här måttet — allsvenska plus eventuella utländska samma säsong. */
  minutes: number;
}

export interface PlayerRating {
  player_id: number;
  season: number;
  club_id: number | null;
  position_group: PositionGroup;
  secondary_position_group: PositionGroup | null;
  position_confidence: number;
  ovr: number | null;
  /** OVR enbart på innevarande säsong, utan shrinkage. Vad han FAKTISKT gjort. */
  current_season_rating: number | null;
  /** OVR enbart på historiken. Vad vi trodde innan säsongen. */
  historical_rating: number | null;
  potential: number | null;
  form: number;
  confidence: number;
  confidence_tier: ConfidenceTier;
  prior_weight: number;
  minutes_played: number;
  /** Minuter utanför Allsvenskan SAMMA säsong som räknats in i det observerade underlaget. */
  external_minutes: number;
  /** Minuter vi känner till men inte kan värdera (cup, träningsmatch, liga utan verifierad koefficient). */
  unrated_minutes: number;
  subscores: Record<SubscoreKey, number | null>;
  historical_evidence: {
    contributions: PriorContribution[];
    /** Sejourer utanför Allsvenskan under SAMMA säsong, inräknade som observerat underlag. */
    current_season_external: { leagueName: string; leagueExternalId: number; leagueCoefficient: number; minutes: number; metrics: MetricKey[] }[];
    /** Känd speltid som inte kunnat värderas, med skäl. Underlag för att prioritera kalibrering. */
    unrated_leagues: UnratedStint[];
    metrics: MetricBreakdown[];
    coverage: number;
    joined_club_date: string | null;
  };
  config_version: string;
  calculated_at: string;
}

/** Mellanresultat från pass 1, innan kompositerna kan rangordnas. */
export interface PreparedPlayer {
  input: PlayerSeasonInput;
  n90: number;
  /** Underlag per mätvärde i 90-minutersekvivalenter. Skiljer sig när spelaren har minuter utanför Allsvenskan samma säsong. */
  n90ByMetric: Partial<Record<MetricKey, number>>;
  isPeer: boolean;
  adjustedPercentiles: Partial<Record<MetricKey, number | null>>;
  observedPercentiles: Partial<Record<MetricKey, number | null>>;
  priorPercentiles: Partial<Record<MetricKey, number | null>>;
  formPercentiles: Partial<Record<MetricKey, number | null>>;
  composite: CompositeResult;
  observedComposite: CompositeResult;
  priorComposite: CompositeResult;
  formComposite: CompositeResult;
  subscoreComposites: Record<SubscoreKey, CompositeResult>;
  prior: PriorResult;
  priorWeight: number;
  confidence: number;
  age: number | null;
}

/**
 * Pass 1: allt som kan räknas för en spelare i isolering — percentiler per
 * mått, prior, shrinkage och den viktade kompositen.
 */
export function preparePlayer(
  input: PlayerSeasonInput,
  distributions: ReferenceDistributions,
  peerMinMinutes: number,
  referenceDate: Date
): PreparedPlayer {
  const group = input.positionGroup;
  const weights = POSITION_WEIGHTS[group].weights;
  const n90 = input.minutes / 90;
  const age = ageAt(input.birthDate, referenceDate);

  const prior = buildPrior(input.history, input.seasonYear, distributions, group);

  const observedPercentiles: Partial<Record<MetricKey, number | null>> = {};
  const priorPercentiles: Partial<Record<MetricKey, number | null>> = {};
  // Prior INKLUSIVE den neutrala fallbacken. Den här — inte priorPercentiles —
  // används till kompositen, så att historik, säsongsbetyg och ovr räknas över
  // exakt samma måttmängd. priorPercentiles behålls som den är för
  // nedbrytningen, där det är viktigt att se skillnad på verklig historik och
  // ett antagande.
  const priorForComposite: Partial<Record<MetricKey, number | null>> = {};
  // Observerat, med prior som utfyllnad där vi inte sett något i år. Gör
  // current_season_rating till rätt kontrafaktiskt jämförelsetal: "så här hade
  // vi bedömt honom om vi tog årets siffror rakt av".
  const observedForComposite: Partial<Record<MetricKey, number | null>> = {};
  const adjustedPercentiles: Partial<Record<MetricKey, number | null>> = {};
  const formPercentiles: Partial<Record<MetricKey, number | null>> = {};

  // Alla mått som spelar roll för den här spelaren: positionsvikterna plus
  // allt som ingår i något delbetyg, så nedbrytningen alltid går att visa.
  //
  // Villkoret nedan såg tidigare ut som `def.goalkeeperOnly === (group === "GK")`,
  // vilket för utespelare jämförde `undefined === false` och alltså aldrig var
  // sant. Följden var att en mittback varken fick avslutnings- eller
  // dribblingsbetyg och en anfallare inget försvarsbetyg — måtten låg utanför
  // positionsvikterna och kom aldrig med. Delbetygen ska täcka hela spelaren,
  // inte bara det som råkar vara viktat för hans position.
  const isGoalkeeper = group === "GK";
  const relevant = new Set<MetricKey>(Object.keys(weights) as MetricKey[]);
  for (const sub of SUBSCORE_KEYS) {
    for (const key of Object.keys(SUBSCORE_WEIGHTS[sub]) as MetricKey[]) {
      if (isApplicableMetric(key, isGoalkeeper)) relevant.add(key);
    }
  }

  // Vilka mått som vilar på verklig evidens (observerat värde eller riktig
  // historik) snarare än på den neutrala fallbacken. Styr confidence.
  const evidenceByMetric: Partial<Record<MetricKey, boolean>> = {};
  // Underlaget per mått i 90-minutersekvivalenter. Skiljer sig mellan mått när
  // spelaren har minuter utanför Allsvenskan samma säsong — de täcker bara
  // mål, assist, mål+assist och kort.
  const n90ByMetric: Partial<Record<MetricKey, number>> = {};

  for (const key of relevant) {
    const def = METRICS[key];
    if (def.unavailableSeasons?.includes(input.seasonYear)) {
      observedPercentiles[key] = null;
      priorPercentiles[key] = null;
      priorForComposite[key] = null;
      observedForComposite[key] = null;
      adjustedPercentiles[key] = null;
      continue;
    }
    const blended = blendObservedPercentile(
      distributions,
      group,
      key,
      input.metrics[key],
      input.minutes,
      input.currentSeasonExternal
    );
    const observed = blended.percentile;
    // Faller tillbaka på de allsvenska minuterna när måttet saknar observation
    // helt — då är n90 ändå bara en ingång till shrinkagen mot prior.
    const metricN90 = (blended.minutes > 0 ? blended.minutes : input.minutes) / 90;
    n90ByMetric[key] = metricN90;
    const rawPrior = prior.percentiles[key];
    const hasRealPrior = rawPrior !== undefined && Number.isFinite(rawPrior);

    // Specens 4.2: saknas historik helt används positionsgruppens median.
    // Utan den regeln får en spelare med 53 minuter sitt obearbetade stickprov
    // rakt in i betyget och kan toppa ligan på en enda målchans.
    const priorValue = hasRealPrior
      ? ageAdjustPriorPercentile(rawPrior as number, age)
      : NEUTRAL_PRIOR_PERCENTILE;

    // En neutral prior bär mindre information än en verklig och drar därför
    // med halva k — annars straffas en genuin nykomling med en hel säsong
    // bakom sig för att vi inte råkar ha data från innan.
    const k = STABILISATION[def.stabilisation] * (hasRealPrior ? 1 : NEUTRAL_PRIOR_K_FACTOR);

    observedPercentiles[key] = observed;
    priorPercentiles[key] = hasRealPrior ? priorValue : null;
    priorForComposite[key] = priorValue;
    observedForComposite[key] = observed ?? priorValue;
    adjustedPercentiles[key] = shrinkToPrior(observed, priorValue, metricN90, k);
    evidenceByMetric[key] = observed !== null || hasRealPrior;

    if (input.recentFormMetrics) {
      formPercentiles[key] = metricPercentile(distributions, group, key, input.recentFormMetrics[key] ?? null);
    }
  }

  const composite = compositeScore(adjustedPercentiles, weights);
  // Alla tre kompositer räknas över SAMMA måttmängd, med samma vikter. Per
  // mätvärde är det justerade värdet en konvex kombination av de två andra, och
  // via den gemensamma referensfördelningen (se rankAgainstReference) hamnar
  // ovr därför mellan säsongsbetyg och historik.
  //
  // EXAKT gäller det när alla mätvärden delar samma k. Gör de inte det — och
  // det ska de inte, k är hela poängen med stabiliseringstabellen — kan
  // blandningsvikten skilja sig mellan mätvärden, och då kan den viktade
  // kompositen hamna strax utanför spannet. Enkelt motexempel med två lika
  // viktade mätvärden: observerat [100, 0] och prior [0, 100] ger båda
  // kompositen 50, men om det första måttet stabiliserar snabbt (lambda ~ 1)
  // och det andra långsamt (lambda ~ 0) blir det justerade [100, 100].
  //
  // I praktiken är effekten liten: över hela Allsvenskan 2025 och 2026 ligger
  // 831 av 895 betyg inom spannet och den största avvikelsen är 3,5 OVR. Det
  // är en verklig egenskap hos modellen, inte ett fel — och den redovisas
  // hellre än döljs med en klamring som skulle förvanska betyget.
  const observedComposite = compositeScore(observedForComposite, weights);
  const priorComposite = compositeScore(priorForComposite, weights);
  const formComposite = compositeScore(formPercentiles, weights);

  const subscoreComposites = {} as Record<SubscoreKey, CompositeResult>;
  for (const sub of SUBSCORE_KEYS) {
    if (!isApplicableSubscore(sub, isGoalkeeper)) {
      subscoreComposites[sub] = { score: null, coverage: 0, missingWeight: 100 };
      continue;
    }
    subscoreComposites[sub] = compositeScore(adjustedPercentiles, SUBSCORE_WEIGHTS[sub]);
  }

  // prior_weight: viktat snitt av k/(n+k) över de mått som faktiskt bidrog.
  // Räknar in BÅDE verklig historik och den neutrala fallbacken — båda betyder
  // att betyget inte kommer från den här säsongen, vilket är precis vad talet
  // ska svara på.
  let priorWeightSum = 0;
  let priorWeightTotal = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    if (adjustedPercentiles[key] === null || adjustedPercentiles[key] === undefined) continue;
    priorWeightTotal += weight;
    const hasRealPrior = priorPercentiles[key] !== null && priorPercentiles[key] !== undefined;
    const hasObserved = observedPercentiles[key] !== null && observedPercentiles[key] !== undefined;
    const k = STABILISATION[METRICS[key].stabilisation] * (hasRealPrior ? 1 : NEUTRAL_PRIOR_K_FACTOR);
    priorWeightSum += weight * (hasObserved ? priorShare(n90ByMetric[key] ?? n90, k) : 1);
  }
  const priorWeight = priorWeightTotal > 0 ? priorWeightSum / priorWeightTotal : 0;

  // Effektivt underlag för confidence: viktat snitt av mättens egna n90. En
  // spelare med utländska minuter samma säsong har mer underlag om sitt
  // målskytte än om sitt duellspel, och confidence ska spegla helheten.
  let n90WeightedSum = 0;
  let n90WeightTotal = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    n90WeightedSum += weight * (n90ByMetric[key] ?? n90);
    n90WeightTotal += weight;
  }
  const effectiveN90 = n90WeightTotal > 0 ? n90WeightedSum / n90WeightTotal : n90;

  // Täckning av VERKLIG evidens: hur stor del av vikten som vilar på antingen
  // ett observerat värde eller riktig historik, i motsats till den neutrala
  // fallbacken. Ett betyg som till största delen är "vi antar medelmåttig" ska
  // aldrig få hög confidence, hur många mått det än råkar täcka.
  let evidenceWeight = 0;
  let allWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    allWeight += weight;
    if (evidenceByMetric[key]) evidenceWeight += weight;
  }
  const evidenceCoverage = allWeight > 0 ? evidenceWeight / allWeight : 0;

  // Speltid vi inte kan värdera sänker confidence. Ett betyg som bortser från
  // halva spelarens säsong är mindre att lita på än ett som inte gör det, även
  // när det som räknats är korrekt räknat.
  //
  // Bara INNEVARANDE säsongs ovärderbara minuter räknas. Andelen ska svara på
  // "hur stor del av det spelaren gjort I ÅR kan vi väga in?", och då måste
  // täljare och nämnare gälla samma period. Historiska cupminuter i täljaren
  // mot bara årets minuter i nämnaren gav en andel som kunde närma sig 1 för en
  // spelare med en helt normal säsong — och sänkte i en mellanversion antalet
  // spelare med hög confidence från 72 till 19 utan att något blivit osäkrare.
  // Äldre ovärderbar speltid syns fortfarande i historical_evidence.
  const currentUnrated = input.unratedStints.filter((u) => u.seasonYear === input.seasonYear);
  const unratedMinutes = currentUnrated.reduce((a, u) => a + u.minutes, 0);
  const totalKnownMinutes =
    input.minutes + input.currentSeasonExternal.reduce((a, e) => a + e.minutes, 0) + unratedMinutes;
  const unratedShare = totalKnownMinutes > 0 ? unratedMinutes / totalKnownMinutes : 0;
  const unratedFactor = 1 - UNRATED_CONFIDENCE_PENALTY * unratedShare;

  return {
    input,
    n90,
    n90ByMetric,
    isPeer: input.minutes >= peerMinMinutes,
    adjustedPercentiles,
    observedPercentiles,
    priorPercentiles,
    formPercentiles,
    composite,
    observedComposite,
    priorComposite,
    formComposite,
    subscoreComposites,
    prior,
    priorWeight,
    confidence:
      computeConfidence(effectiveN90, weights, Math.min(composite.coverage, evidenceCoverage)) * unratedFactor,
    age,
  };
}

/**
 * Pass 2: rangordnar alla kompositer inom positionsgrupp och mappar till OVR.
 *
 * Det här är hela motorns ingång. Anroparen levererar en färdig lista av
 * spelare för EN säsong plus referensfördelningarna, och får tillbaka färdiga
 * betyg. Ingen databas rörs.
 */
export function computeRatings(
  prepared: readonly PreparedPlayer[],
  calculatedAt: string
): PlayerRating[] {
  const groupOf = (p: PreparedPlayer) => p.input.positionGroup;

  // EN gemensam referensfördelning för ovr, säsongsbetyg och historik — se
  // rankAgainstReference. Utan den mäts de tre mot olika måttstockar och kan
  // inte läsas bredvid varandra.
  const reference = buildCompositeReference(
    prepared.map((p) => ({ group: groupOf(p), score: p.composite.score, isPeer: p.isPeer }))
  );
  const rank = (pick: (p: PreparedPlayer) => number | null) =>
    rankAgainstReference(
      reference,
      prepared.map((p) => ({ key: p.input.playerId, group: groupOf(p), score: pick(p) }))
    );

  const ovrPercentiles = rank((p) => p.composite.score);
  const observedPercentilesRanked = rank((p) => p.observedComposite.score);
  const priorPercentilesRanked = rank((p) => p.priorComposite.score);
  const formPercentilesRanked = rank((p) => p.formComposite.score);

  // Delbetygen har sina EGNA fördelningar: de viktar andra mått och deras
  // kompositer ligger inte på samma skala som helhetsbetygets.
  const subscoreRanked = {} as Record<SubscoreKey, Map<string | number, number | null>>;
  for (const sub of SUBSCORE_KEYS) {
    subscoreRanked[sub] = rankComposites(
      prepared.map((p) => ({ key: p.input.playerId, group: groupOf(p), score: p.subscoreComposites[sub].score, isPeer: p.isPeer }))
    );
  }

  return prepared.map((p) => {
    const group = p.input.positionGroup;
    const weights = POSITION_WEIGHTS[group].weights;

    const ovrPercentile = ovrPercentiles.get(p.input.playerId) ?? null;
    const ovr = ovrPercentile === null ? null : anchorToOvr(ovrPercentile);

    const observedP = observedPercentilesRanked.get(p.input.playerId) ?? null;
    const priorP = priorPercentilesRanked.get(p.input.playerId) ?? null;
    const formP = formPercentilesRanked.get(p.input.playerId) ?? null;

    const subscores = {} as Record<SubscoreKey, number | null>;
    for (const sub of SUBSCORE_KEYS) {
      const sp = subscoreRanked[sub].get(p.input.playerId) ?? null;
      subscores[sub] = sp === null ? null : anchorToOvr(sp);
    }

    // Form: hur spelaren presterat de senaste matcherna i nuvarande klubb,
    // jämfört med sin egen säsongsnivå. Ingen shrinkage, och den rör ALDRIG
    // OVR — det är två olika frågor ("hur bra är han?" och "hur går det just nu?").
    //
    // Jämförelsen sker mot current_season_rating, inte mot ovr: båda är då
    // oshrinkade och mätta på samma sätt. Att jämföra en oshrinkad femmatchers-
    // siffra mot ett shrinkat säsongsbetyg skulle mest mäta shrinkagen.
    let form = 0;
    if (formP !== null && observedP !== null) {
      form = clamp(((formP - observedP) / 50) * FORM_RANGE, -FORM_RANGE, FORM_RANGE);
    }

    // Potential: ren åldersprojektion mot AGE_PEAK, inget annat. Det är INTE en
    // scoutbedömning och vet ingenting om talang — bara att en 19-åring
    // typiskt har utvecklingsutrymme kvar som en 29-åring inte har. Samma kurva
    // som åldersjusterar prior, så de två aldrig säger emot varandra.
    let potential: number | null = null;
    if (ovr !== null && p.age !== null) {
      const gain = Math.max(0, ageAdjustment(p.age) - ageAdjustment(AGE_PEAK));
      potential = round1(Math.min(OVR_CAP, ovr + gain));
    }

    const breakdown: MetricBreakdown[] = (Object.keys(weights) as MetricKey[]).map((key) => ({
      metric: key,
      label: METRICS[key].label,
      weight: weights[key] as number,
      rawValue: p.input.metrics[key] ?? null,
      observedPercentile: roundOrNull(p.observedPercentiles[key]),
      priorPercentile: roundOrNull(p.priorPercentiles[key]),
      adjustedPercentile: roundOrNull(p.adjustedPercentiles[key]),
      k: STABILISATION[METRICS[key].stabilisation],
      priorShare: round3(priorShare(p.n90ByMetric[key] ?? p.n90, STABILISATION[METRICS[key].stabilisation])),
      minutes: Math.round((p.n90ByMetric[key] ?? p.n90) * 90),
    }));

    return {
      player_id: p.input.playerId,
      season: p.input.seasonYear,
      club_id: p.input.clubId,
      position_group: group,
      secondary_position_group: p.input.secondaryPositionGroup,
      position_confidence: round3(p.input.positionConfidence),
      ovr,
      current_season_rating: observedP === null ? null : anchorToOvr(observedP),
      historical_rating: priorP === null ? null : anchorToOvr(priorP),
      potential,
      form: round1(form),
      confidence: round3(p.confidence),
      confidence_tier: confidenceTier(p.confidence),
      prior_weight: round3(p.priorWeight),
      minutes_played: p.input.minutes,
      external_minutes: p.input.currentSeasonExternal.reduce((a, e) => a + e.minutes, 0),
      unrated_minutes: p.input.unratedStints.filter((u) => u.seasonYear === p.input.seasonYear).reduce((a, u) => a + u.minutes, 0),
      subscores,
      historical_evidence: {
        contributions: p.prior.contributions,
        current_season_external: p.input.currentSeasonExternal.map((e) => ({
          leagueName: e.leagueName,
          leagueExternalId: e.leagueExternalId,
          leagueCoefficient: e.leagueCoefficient,
          minutes: e.minutes,
          metrics: (Object.keys(e.per90) as MetricKey[]).filter((k) => e.per90[k] !== null && e.per90[k] !== undefined),
        })),
        unrated_leagues: [...p.input.unratedStints],
        metrics: breakdown,
        coverage: round3(p.composite.coverage),
        joined_club_date: p.input.joinedClubDate,
      },
      config_version: CONFIG_VERSION,
      calculated_at: calculatedAt,
    };
  });
}

/**
 * Gäller mätvärdet den här spelartypen?
 *
 * Målvakter får sina egna mått plus passningsprocent och passningsvolym —
 * utspelet är en verklig bedömningsdimension för en modern målvakt, och båda
 * måtten finns i källdatan för dem. Nyckelpassningar utelämnas: en målvakt
 * lägger några per säsong och talet är rent brus.
 */
function isApplicableMetric(key: MetricKey, isGoalkeeper: boolean): boolean {
  const def = METRICS[key];
  if (isGoalkeeper) {
    return def.goalkeeperOnly === true || key === "pass_pct" || key === "pass_volume_per90";
  }
  return def.goalkeeperOnly !== true;
}

/**
 * Målvakter får målvaktsbetyget och ett passningsbetyg (utspel). Utespelare får
 * de fem övriga. Ingen får ett delbetyg vars mått inte gäller dem.
 */
function isApplicableSubscore(sub: SubscoreKey, isGoalkeeper: boolean): boolean {
  if (isGoalkeeper) return sub === "goalkeeping" || sub === "passing";
  return sub !== "goalkeeping";
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

function roundOrNull(x: number | null | undefined): number | null {
  return x === null || x === undefined || !Number.isFinite(x) ? null : round1(x);
}
