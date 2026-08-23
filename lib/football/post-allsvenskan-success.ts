import type { PostAllsvenskanPlayer } from "./post-allsvenskan";
import { LEVEL_LABEL, LEVEL_SCORE, type LeagueStrength } from "./post-allsvenskan-level";
import { getPositionGroup, type PositionGroupKey } from "./position-group";

/**
 * Fas 18j (2026-08-23, användarbeslut) — "Mest lyckad efter Allsvenskan".
 *
 * Uttryckligt användarkrav: det får INTE vara "flest mål = bäst", och Claude
 * får INTE hitta på "bäst totalt" — hur det räknas ska vara definierat och
 * synligt. Det här är den definitionen. Fem komponenter, var och en 0–100,
 * viktade enligt nedan. ALLA bygger på redan Allsvensk-fritt filtrerade
 * fält i PostAllsvenskanPlayer (se den filens filhuvud) — Allsvensk
 * statistik kan aldrig läcka in i "mest lyckad".
 *
 *   Etablering   30 %  total speltid utomlands (percentil mot hela urvalet)
 *   Nivå         25 %  hur stark liga minuterna spelats i (se
 *                      post-allsvenskan-level.ts)
 *   Produktion   20 %  mål + assist, percentil INOM POSITIONSGRUPP
 *   Kvalitet     15 %  snittbetyg, percentil INOM POSITIONSGRUPP
 *   Uthållighet  10 %  längsta sammanhängande utlandssvit i år (percentil)
 *
 * ── Varför just de vikterna ──────────────────────────────────────────────
 * Etablering väger tyngst därför att den är det enda måttet som är svårt
 * att få av tur: 15 000–20 000 minuter betyder att en spelare fått spela
 * under lång tid, medan mål kan komma av en kort explosiv period (uttryckligt
 * användarresonemang, 2026-08-23). Nivå väger näst tyngst eftersom 20 000
 * minuter i en lägre division inte är samma karriär som 20 000 i Premier
 * League. Produktion väger under de två, och bara mot spelare i samma
 * positionsgrupp — annars hade ingen försvarare någonsin kunnat vinna. Betyg
 * väger minst av de "riktiga" måtten eftersom det saknas för ~20 % av
 * spelarna och dess skala varierar mellan ligor. Vikterna är expertbedömda
 * och öppet redovisade, precis som POSITION_RATING_CONFIG — inte anpassade
 * mot något facit (det finns inget facit för "lyckad karriär").
 *
 * ── Hur saknad data hanteras (ALDRIG som en nolla) ───────────────────────
 * En spelare utan betyg får inte 0 i kvalitet — komponentens vikt fördelas
 * proportionellt ut på de komponenter som FINNS. Målvakter bedöms aldrig på
 * mål+assist (produktionskomponenten utgår helt för dem, samma princip som
 * lib/ovr/compute.ts). `coverage` säger hur stor andel av vikten som
 * täcks av verklig data — under MIN_COVERAGE rankas spelaren inte alls.
 *
 * ── Presentation ─────────────────────────────────────────────────────────
 * `score` är MEDVETET inte till för att visas som ett tal. Användaren valde
 * uttryckligen (2026-08-23) "rubrik + motivering, inget poängtal" framför ett
 * synligt 0–100-index — poängen finns bara för att kunna sortera och rangordna.
 * Visa `highlights` istället: verkliga siffror, inte ett hopkok.
 */

export const SUCCESS_WEIGHTS = {
  establishment: 30,
  level: 25,
  production: 20,
  quality: 15,
  endurance: 10,
} as const;

export type SuccessComponentKey = keyof typeof SUCCESS_WEIGHTS;

/**
 * Kvalgräns: minst 30 matcher ELLER 2 700 minuter (~30 fulla matcher)
 * utomlands. Utan den kan en spelare med 3 lysande matcher toppa listan över
 * en hel dokumenterad utlandskarriär. Spelare under gränsen försvinner INTE
 * ur Efter Allsvenskan-listan — de får bara ingen "mest lyckad"-rankning.
 */
export const SUCCESS_MIN_APPEARANCES = 30;
export const SUCCESS_MIN_MINUTES = 2700;

/** Minsta andel av totalvikten som måste täckas av verklig data för att rankas. */
export const SUCCESS_MIN_COVERAGE = 0.55;

export interface SuccessComponent {
  key: SuccessComponentKey;
  label: string;
  /** 0–100. */
  score: number;
  /** Effektiv vikt i procent EFTER omfördelning av saknade komponenter. */
  weight: number;
  /** Vad komponenten faktiskt mätte, i klartext med verkliga tal. */
  detail: string;
}

export interface PostAllsvenskanSuccessEntry {
  player: PostAllsvenskanPlayer;
  rank: number;
  /** 0–100. Används för sortering/rangordning — visas ALDRIG som ett tal, se filhuvudet. */
  score: number;
  components: SuccessComponent[];
  /** Andel av totalvikten som täcktes av verklig data (1 = allt fanns). */
  coverage: number;
  /** Positionsgruppens svenska pluralform ("anfallare"), null om position saknas. */
  positionLabel: string | null;
  /** Färdiga, verkliga meningar som motiverar placeringen — grunden för UI:t. */
  highlights: string[];
}

const COMPONENT_LABEL: Record<SuccessComponentKey, string> = {
  establishment: "Etablering",
  level: "Nivå",
  production: "Produktion",
  quality: "Kvalitet",
  endurance: "Uthållighet",
};

/**
 * Percentilrang 0–100: andelen i poolen som ligger STRIKT under, plus halva
 * andelen som ligger exakt lika (standard "mid-rank"-hantering, så att en
 * klump på samma värde inte godtyckligt gynnar den ena). Poolen innehåller
 * alltid spelaren själv.
 */
function percentileRank(value: number, pool: number[]): number {
  if (pool.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const v of pool) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / pool.length) * 100;
}

/** "Topp X %" av en percentil — alltid minst 1, aldrig 0 % (som skulle antyda att ingen är bättre). */
function topPercent(percentile: number): number {
  return Math.max(1, Math.round(100 - percentile));
}

/**
 * Nivåpoäng 0–100: 70 % minutviktat snitt över spelarens LIGA-minuter,
 * 30 % toppnivån hen faktiskt etablerade sig på (>= 900 min).
 *
 * Blandningen finns för att ingen av delarna räcker ensam: ett rent
 * minutsnitt straffar spelaren som hade tre år i Serie A och sedan trappade
 * ner i Danmark, medan ren toppnivå skulle ge samma poäng till den som spelat
 * EN säsong i Bundesliga som till den som spelat tio. null när spelaren
 * saknar klassade liga-minuter helt (bara cup-/kontinental-/oklassad data).
 */
function computeLevelScore(player: PostAllsvenskanPlayer): { score: number; classifiedMinutes: number } | null {
  let weightedSum = 0;
  let classifiedMinutes = 0;
  for (const level of [1, 2, 3, 4, 5] as const) {
    const minutes = player.minutesByLevel[level];
    if (minutes <= 0) continue;
    weightedSum += LEVEL_SCORE[level] * minutes;
    classifiedMinutes += minutes;
  }
  if (classifiedMinutes === 0) return null;
  const minuteWeighted = weightedSum / classifiedMinutes;
  const peak = player.peakLevel !== null ? LEVEL_SCORE[player.peakLevel] : minuteWeighted;
  return { score: minuteWeighted * 0.7 + peak * 0.3, classifiedMinutes };
}

/** Andel av spelarens klassade liga-minuter som spelats på en given nivå (0–1). */
function shareAtLevel(player: PostAllsvenskanPlayer, level: LeagueStrength, classifiedMinutes: number): number {
  return classifiedMinutes > 0 ? player.minutesByLevel[level] / classifiedMinutes : 0;
}

export interface PostAllsvenskanSuccessResult {
  /** Alla rankade spelare, bäst först. */
  ranked: PostAllsvenskanSuccessEntry[];
  /** Antal spelare som föll på kvalgränsen (för en ärlig fotnot i UI:t). */
  excludedByThreshold: number;
}

export function computePostAllsvenskanSuccess(players: PostAllsvenskanPlayer[]): PostAllsvenskanSuccessResult {
  const eligible = players.filter((p) => p.appearances >= SUCCESS_MIN_APPEARANCES || p.minutesPlayed >= SUCCESS_MIN_MINUTES);
  const excludedByThreshold = players.length - eligible.length;
  if (eligible.length === 0) return { ranked: [], excludedByThreshold };

  // Jämförelsepooler. Etablering/uthållighet är positionsneutrala (en
  // målvakt kan spela lika många minuter som en anfallare) och jämförs mot
  // HELA urvalet. Produktion/kvalitet jämförs bara inom positionsgrupp — se
  // position-group.ts för varför en blandad pool ger artefakter.
  const minutesPool = eligible.map((p) => p.minutesPlayed);
  const endurancePool = eligible.map((p) => p.longestAbroadStreakYears);

  const productionPoolByGroup = new Map<PositionGroupKey, number[]>();
  const qualityPoolByGroup = new Map<PositionGroupKey, number[]>();
  for (const p of eligible) {
    const group = getPositionGroup(p.position)?.group;
    if (!group) continue;
    if (group !== "goalkeeper") {
      const pool = productionPoolByGroup.get(group) ?? [];
      pool.push(p.goals + p.assists);
      productionPoolByGroup.set(group, pool);
    }
    if (p.avgRating !== null) {
      const pool = qualityPoolByGroup.get(group) ?? [];
      pool.push(p.avgRating);
      qualityPoolByGroup.set(group, pool);
    }
  }

  const entries: Omit<PostAllsvenskanSuccessEntry, "rank">[] = [];
  for (const player of eligible) {
    const groupInfo = getPositionGroup(player.position);
    const group = groupInfo?.group;
    const available: { key: SuccessComponentKey; score: number; detail: string }[] = [];

    const minutesPercentile = percentileRank(player.minutesPlayed, minutesPool);
    available.push({
      key: "establishment",
      score: minutesPercentile,
      detail: `${player.minutesPlayed.toLocaleString("sv-SE")} minuter på ${player.appearances} matcher — topp ${topPercent(minutesPercentile)} % i speltid av ${eligible.length} rankade spelare`,
    });

    const level = computeLevelScore(player);
    if (level) {
      const peakText = player.peakLevel !== null ? `Etablerad i ${LEVEL_LABEL[player.peakLevel]}` : "Ingen nivå med minst 900 minuter";
      available.push({
        key: "level",
        score: level.score,
        detail: `${peakText} — ${Math.round((level.classifiedMinutes / Math.max(1, player.minutesPlayed)) * 100)} % av speltiden ligger i klassade ligamatcher`,
      });
    }

    // Målvakter bedöms aldrig på mål+assist — vikten går till övriga komponenter.
    if (group && group !== "goalkeeper") {
      const pool = productionPoolByGroup.get(group) ?? [];
      const production = player.goals + player.assists;
      const percentile = percentileRank(production, pool);
      available.push({
        key: "production",
        score: percentile,
        detail: `${player.goals} mål + ${player.assists} assist — topp ${topPercent(percentile)} % bland ${pool.length} ${groupInfo!.label}`,
      });
    }

    if (group && player.avgRating !== null) {
      const pool = qualityPoolByGroup.get(group) ?? [];
      const percentile = percentileRank(player.avgRating, pool);
      available.push({
        key: "quality",
        score: percentile,
        detail: `Snittbetyg ${player.avgRating} — topp ${topPercent(percentile)} % bland ${pool.length} ${groupInfo!.label} med betyg`,
      });
    }

    const endurancePercentile = percentileRank(player.longestAbroadStreakYears, endurancePool);
    available.push({
      key: "endurance",
      score: endurancePercentile,
      detail: `${player.longestAbroadStreakYears} sammanhängande år utomlands (${player.longestAbroadStreakFromYear}–${player.longestAbroadStreakToYear})`,
    });

    // Omfördela saknade komponenters vikt proportionellt över de som finns —
    // aldrig genom att sätta en saknad komponent till 0.
    const availableWeight = available.reduce((sum, c) => sum + SUCCESS_WEIGHTS[c.key], 0);
    const coverage = availableWeight / 100;
    if (coverage < SUCCESS_MIN_COVERAGE) continue;

    const components: SuccessComponent[] = available.map((c) => ({
      key: c.key,
      label: COMPONENT_LABEL[c.key],
      score: Math.round(c.score * 10) / 10,
      weight: Math.round((SUCCESS_WEIGHTS[c.key] / availableWeight) * 1000) / 10,
      detail: c.detail,
    }));
    const score = available.reduce((sum, c) => sum + c.score * (SUCCESS_WEIGHTS[c.key] / availableWeight), 0);

    entries.push({
      player,
      score: Math.round(score * 100) / 100,
      components,
      coverage,
      positionLabel: groupInfo?.label ?? null,
      highlights: buildHighlights(player, components, level?.classifiedMinutes ?? 0),
    });
  }

  const ranked = entries
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { ranked, excludedByThreshold };
}

/**
 * Motiveringen som visas istället för ett poängtal. Byggd av spelarens
 * FAKTISKA tal — aldrig en generisk formulering. Nivåraden kommer först när
 * den är stark, eftersom det är den enda uppgiften en scout inte kan läsa
 * ut ur mål/minuter-kolumnerna i listan.
 */
function buildHighlights(player: PostAllsvenskanPlayer, components: SuccessComponent[], classifiedMinutes: number): string[] {
  const highlights: string[] = [];

  const topLevelShare = shareAtLevel(player, 5, classifiedMinutes);
  const strongLevelShare = topLevelShare + shareAtLevel(player, 4, classifiedMinutes);
  if (topLevelShare >= 0.2) {
    highlights.push(`${Math.round(topLevelShare * 100)} % av ligaspelet i ${LEVEL_LABEL[5]}`);
  } else if (strongLevelShare >= 0.35) {
    highlights.push(`${Math.round(strongLevelShare * 100)} % av ligaspelet i ${LEVEL_LABEL[4]} eller högre`);
  } else if (player.peakLevel !== null) {
    highlights.push(`Etablerad i ${LEVEL_LABEL[player.peakLevel]}`);
  }

  // Övriga komponenter i fallande styrka — bara de som faktiskt är starka
  // (percentil >= 70) får plats, så att motiveringen aldrig skryter om ett
  // medelmåttigt värde.
  const rest = components
    .filter((c) => c.key !== "level" && c.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const c of rest) highlights.push(c.detail);

  return highlights;
}
