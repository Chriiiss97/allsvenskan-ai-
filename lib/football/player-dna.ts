import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { getPositionGroup, selectPeers, type PositionGroupKey } from "./position-group";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Player DNA — analysmotor (se plan godkänd 2026-08-20)
 * ============================================================================
 * Det här är INTE ett påhittat betyg. Varje siffra går att spåra till en
 * konkret jämförelsegrupp och konkreta underliggande tal (se `metrics` på
 * varje kategori) — det är produktens signaturprincip ("visa min
 * beräkning"), inte bara en implementationsdetalj.
 *
 * Peer-poolen är SÄSONGSPOOLAD (2022–2024 tillsammans, samma liga) istället
 * för en enskild säsong — vår databas har bara IFK Göteborg + AIK, så en
 * enskild säsong ger för få jämförelsepunkter per position (13–28 spelare).
 * Poolad över tre säsonger blir underlaget 3–4x större. Peer-raden filtreras
 * fortfarande genom `hasPlayedSeason` (aldrig "registrerad men aldrig
 * spelade") och genom samma positions- + minutgolvsmodell som
 * getPlayerProfile använder för sin (enskild-säsongs-) benchmarking — se
 * lib/football/position-group.ts.
 *
 * Confidence är TVÅDIMENSIONELLT: spelarens EGEN speltid den här säsongen,
 * OCH hur många peers jämförelsen faktiskt bygger på. Bara det svagaste av
 * de två avgör — 2500 minuter mot en pool på 3 är fortfarande ett lågt
 * konfidensläge, och tvärtom.
 *
 * Målvakter får INGEN profil: vi har ingen målvaktsspecifik data (räddningar,
 * insläppta mål, clean sheets) — API-Football skickar det, men vårt eget
 * typlager (lib/api-football/types.ts) hämtar det inte idag. Att bygga en
 * "DNA"-profil av utespelarmått för en målvakt vore att låtsas att datan
 * finns. Se PlayerDNA.available === false.
 */

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type DNACategoryKey =
  | "avslutning"
  | "kreativitet"
  | "bollinvolvering"
  | "dribbling"
  | "duellspel"
  | "forsvar";

export const CATEGORY_LABELS: Record<DNACategoryKey, string> = {
  avslutning: "Avslutningsfarlighet",
  kreativitet: "Kreativitet",
  bollinvolvering: "Bollinvolvering",
  dribbling: "Dribbling & progression",
  duellspel: "Duellspel",
  forsvar: "Defensivt arbete",
};

export const CATEGORY_KEYS: DNACategoryKey[] = [
  "avslutning",
  "kreativitet",
  "bollinvolvering",
  "dribbling",
  "duellspel",
  "forsvar",
];

/**
 * Vilka kategorier som är "primära" för en position — resten blir
 * "sekundära". Det här styr både visuell vikt (primära ska dominera
 * fingeravtrycket) och vad som räknas som ett "aha" (en HÖG sekundär
 * kategori är intressant, en hög primär kategori är bara väntat).
 * Dokumenterat en gång här, aldrig gissat på annat håll.
 */
const PRIMARY_CATEGORIES: Record<PositionGroupKey, DNACategoryKey[]> = {
  attacker: ["avslutning", "kreativitet", "dribbling"],
  midfielder: ["duellspel", "bollinvolvering", "kreativitet"],
  defender: ["duellspel", "forsvar"],
  goalkeeper: [],
};

export interface PlayerDNAMetricDetail {
  label: string;
  playerValue: number;
  peerAverage: number;
  percentile: number;
  unit: string; // "/90" eller "%" — självständig enhet, aldrig hopklistrad med en till suffix vid visning
}

export interface PlayerDNACategory {
  score: number | null; // medel av underliggande percentiler, null om inget mått finns
  tier: "primary" | "secondary";
  metrics: PlayerDNAMetricDetail[]; // tomt om score är null — "visa min beräkning"-underlaget
}

export type ConfidenceTier = "hög" | "medel" | "låg";

export interface DNAConfidence {
  tier: ConfidenceTier;
  peerLabel: string; // "anfallare"
  peerCount: number;
  ownMinutes: number;
  ownTier: ConfidenceTier;
  peerTier: ConfidenceTier;
  minMinutesApplied: number;
  pooledSeasons: number[]; // vilka säsonger peer-poolen faktiskt byggde på
}

export interface PlayerDNAInsight {
  type: "strength" | "weakness" | "unique" | "aha";
  text: string;
  categoryKey?: DNACategoryKey;
}

export interface PlayerTypeResult {
  label: string | null;
  reason: string | null; // vilka trösklar/tal som triggade etiketten — spårbarhet
}

export interface PlayerDNA {
  available: boolean;
  unavailableReason: string | null;
  categories: Record<DNACategoryKey, PlayerDNACategory>;
  confidence: DNAConfidence | null;
  playerType: PlayerTypeResult;
  /** Sammanfattningsparagrafen — 2-4 meningar, samma data som insights, bara i löptext istället för punktlista. */
  summary: string | null;
  insights: PlayerDNAInsight[];
}

// ---------------------------------------------------------------------------
// Rådata
// ---------------------------------------------------------------------------

interface StatRow {
  player_id: number;
  minutes_played: number;
  appearances: number;
  goals: number;
  assists: number;
  shots_total: number | null;
  shots_on_target: number | null;
  passes_key: number | null;
  passes_total: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  duels_won: number | null;
  duels_total: number | null;
  fouls_drawn: number | null;
  fouls_committed: number | null;
  tackles_total: number | null;
  tackles_interceptions: number | null;
  player: { position: string | null } | null;
  season: { year: number } | null;
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------

function per90(value: number | null, minutes: number): number | null {
  if (value === null || minutes <= 0) return null;
  return (value / minutes) * 90;
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function duelsWinRate(row: { duels_total: number | null; duels_won: number | null }): number | null {
  if (!row.duels_total || row.duels_total <= 0 || row.duels_won === null) return null;
  return (row.duels_won / row.duels_total) * 100;
}

/** Percentil = andel peers med lägre-eller-lika värde. Robust mot skeva små samples (inget normalfördelningsantagande, till skillnad från en z-score). */
function percentile(value: number, peerValues: number[]): number {
  const countLessOrEqual = peerValues.filter((v) => v <= value).length;
  return Math.round((countLessOrEqual / peerValues.length) * 100);
}

function buildMetric(
  label: string,
  playerValue: number | null,
  peerValues: number[],
  unit = "/90"
): PlayerDNAMetricDetail | null {
  if (playerValue === null || peerValues.length === 0) return null;
  return {
    label,
    playerValue: round1(playerValue),
    peerAverage: round1(mean(peerValues)),
    percentile: percentile(playerValue, peerValues),
    unit,
  };
}

function buildCategory(tier: "primary" | "secondary", metrics: (PlayerDNAMetricDetail | null)[]): PlayerDNACategory {
  const usable = metrics.filter((m): m is PlayerDNAMetricDetail => m !== null);
  if (usable.length === 0) return { score: null, tier, metrics: [] };
  const score = Math.round(usable.reduce((a, m) => a + m.percentile, 0) / usable.length);
  return { score, tier, metrics: usable };
}

function tierFromThresholds(value: number, high: number, medium: number): ConfidenceTier {
  if (value >= high) return "hög";
  if (value >= medium) return "medel";
  return "låg";
}

const TIER_ORDER: ConfidenceTier[] = ["låg", "medel", "hög"];
function worseTier(a: ConfidenceTier, b: ConfidenceTier): ConfidenceTier {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(a), TIER_ORDER.indexOf(b))];
}

function emptyCategories(): Record<DNACategoryKey, PlayerDNACategory> {
  const out = {} as Record<DNACategoryKey, PlayerDNACategory>;
  for (const key of CATEGORY_KEYS) out[key] = { score: null, tier: "secondary", metrics: [] };
  return out;
}

function unavailable(reason: string): PlayerDNA {
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
// Insikts-motor — allt regelbaserat, allt spårbart till konkreta tal.
// Genereras ALDRIG när confidence.tier === "låg" (se computePlayerDNA).
// ---------------------------------------------------------------------------

function findMetric(cat: PlayerDNACategory, label: string): PlayerDNAMetricDetail | undefined {
  return cat.metrics.find((m) => m.label === label);
}

/** "Skapar mer än han gör mål av" / "Ovanligt effektiv på lite volym" — jämför en volym-mätare mot en utdelnings-mätare inom samma kategori. */
function compareVolumeVsPayoff(
  cat: PlayerDNACategory,
  volumeLabel: string,
  payoffLabel: string
): PlayerDNAInsight | null {
  const volume = findMetric(cat, volumeLabel);
  const payoff = findMetric(cat, payoffLabel);
  if (!volume || !payoff) return null;
  const gap = volume.percentile - payoff.percentile;
  if (gap >= 25) {
    return {
      type: "aha",
      text: `Ligger högt i ${volumeLabel.toLowerCase()} (percentil ${volume.percentile}) men ${payoffLabel.toLowerCase()} följer inte med i samma takt (percentil ${payoff.percentile}) — skapar mer än vad som blir av det.`,
    };
  }
  if (gap <= -25) {
    return {
      type: "aha",
      text: `${payoffLabel} ligger klart högre (percentil ${payoff.percentile}) än volymen i ${volumeLabel.toLowerCase()} (percentil ${volume.percentile}) — ovanligt effektiv på förhållandevis lite underlag.`,
    };
  }
  return null;
}

/** Det enskilda underliggande måttet (inte kategorin) med störst avvikelse från 50:e percentilen. */
function findBiggestSingleMetricGap(
  categories: Record<DNACategoryKey, PlayerDNACategory>,
  exclude: Set<string>
): PlayerDNAInsight | null {
  let best: { metric: PlayerDNAMetricDetail; catKey: DNACategoryKey } | null = null;
  for (const key of CATEGORY_KEYS) {
    for (const m of categories[key].metrics) {
      if (exclude.has(`${key}:${m.label}`)) continue;
      const dist = Math.abs(m.percentile - 50);
      if (!best || dist > Math.abs(best.metric.percentile - 50)) best = { metric: m, catKey: key };
    }
  }
  if (!best || Math.abs(best.metric.percentile - 50) < 35) return null;
  const direction = best.metric.percentile > 50 ? "över" : "under";
  return {
    type: "aha",
    categoryKey: best.catKey,
    text: `Största enskilda avvikelsen mot snittet: ${best.metric.label.toLowerCase()} på ${best.metric.playerValue}${best.metric.unit} — klart ${direction} snittet på ${best.metric.peerAverage}${best.metric.unit}.`,
  };
}

interface KeyCategories {
  strengthKey: DNACategoryKey | null;
  weaknessKey: DNACategoryKey | null;
  uniqueKey: DNACategoryKey | null;
}

/**
 * Vilken kategori är styrkan/svagheten/den mest oväntade — den gemensamma
 * grunden för både sammanfattningsparagrafen och aha-listan, så de två
 * aldrig kan komma fram till olika svar på samma fråga.
 */
function identifyKeyCategories(categories: Record<DNACategoryKey, PlayerDNACategory>): KeyCategories {
  const scored = CATEGORY_KEYS.map((key) => ({ key, cat: categories[key] })).filter((c) => c.cat.score !== null);

  let strengthKey: DNACategoryKey | null = null;
  let weaknessKey: DNACategoryKey | null = null;
  if (scored.length > 0) {
    const best = scored.reduce((a, b) => (b.cat.score! > a.cat.score! ? b : a));
    const worst = scored.reduce((a, b) => (b.cat.score! < a.cat.score! ? b : a));
    if (best.cat.score! >= 70) strengthKey = best.key;
    if (worst.cat.score! <= 30 && worst.key !== strengthKey) weaknessKey = worst.key;
  }

  // Mest unikt: högst sekundär kategori, om den faktiskt sticker ut och inte redan är styrkan.
  const secondaryScored = scored.filter((c) => c.cat.tier === "secondary" && c.key !== strengthKey);
  let uniqueKey: DNACategoryKey | null = null;
  if (secondaryScored.length > 0) {
    const bestSecondary = secondaryScored.reduce((a, b) => (b.cat.score! > a.cat.score! ? b : a));
    if (bestSecondary.cat.score! >= 75) uniqueKey = bestSecondary.key;
  }

  return { strengthKey, weaknessKey, uniqueKey };
}

/**
 * Sammanfattningsparagrafen — 2–4 sammanhängande meningar istället för en
 * punktlista, byggd av EXAKT samma kategorier/percentiler som resten av
 * motorn (identifyKeyCategories + playerType), bara omformulerat till
 * löptext. Fortfarande ren templating, ingen fri text, ingen AI. Inga
 * pronomen ("han"/"hans") — samma neutrala ton som resten av motorn.
 */
function buildSummary(
  playerType: PlayerTypeResult,
  categories: Record<DNACategoryKey, PlayerDNACategory>,
  keys: KeyCategories,
  peerLabel: string
): string | null {
  const { strengthKey, weaknessKey, uniqueKey } = keys;
  if (!strengthKey && !weaknessKey && !uniqueKey && !playerType.label) return null;

  const sentences: string[] = [];

  if (playerType.label && strengthKey) {
    sentences.push(
      `${playerType.label} — starkast i ${CATEGORY_LABELS[strengthKey].toLowerCase()} (percentil ${categories[strengthKey].score} bland ${peerLabel}).`
    );
  } else if (playerType.label) {
    sentences.push(`${playerType.label}.`);
  } else if (strengthKey) {
    sentences.push(
      `Starkast i ${CATEGORY_LABELS[strengthKey].toLowerCase()} (percentil ${categories[strengthKey].score} bland ${peerLabel}).`
    );
  } else {
    sentences.push(`Jämn profil bland ${peerLabel} — ingen kategori sticker ut tydligt över eller under snittet.`);
  }

  if (uniqueKey) {
    sentences.push(
      `Mer oväntat: percentil ${categories[uniqueKey].score} i ${CATEGORY_LABELS[uniqueKey].toLowerCase()} — en sekundär kategori för positionen, alltså inte det man normalt förväntar sig.`
    );
  }

  if (weaknessKey) {
    sentences.push(
      `Svagast är ${CATEGORY_LABELS[weaknessKey].toLowerCase()} (percentil ${categories[weaknessKey].score}), tydligt under snittet för ${peerLabel}.`
    );
  }

  return sentences.join(" ");
}

/** Kvarvarande aha-listan: specifika mönster som INTE redan täcks av sammanfattningsparagrafen (volym-vs-utdelning, störst enskild avvikelse). */
function buildInsights(categories: Record<DNACategoryKey, PlayerDNACategory>, keys: KeyCategories): PlayerDNAInsight[] {
  const insights: PlayerDNAInsight[] = [];

  const volymAvslutning = compareVolumeVsPayoff(categories.avslutning, "Skott", "Mål");
  if (volymAvslutning) insights.push(volymAvslutning);
  const volymKreativitet = compareVolumeVsPayoff(categories.kreativitet, "Nyckelpassningar", "Assist");
  if (volymKreativitet) insights.push(volymKreativitet);

  const usedMetricKeys = new Set<string>();
  for (const key of [keys.strengthKey, keys.weaknessKey] as (DNACategoryKey | null)[]) {
    if (!key) continue;
    for (const m of categories[key].metrics) usedMetricKeys.add(`${key}:${m.label}`);
  }
  const biggestGap = findBiggestSingleMetricGap(categories, usedMetricKeys);
  if (biggestGap) insights.push(biggestGap);

  return insights.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Spelartyp — regelbaserade, positionsspecifika trösklar. Statistiska
// STILTENDENSER, inte taktiska roller (vi har ingen formation/heatmap-data).
// ---------------------------------------------------------------------------

function inferPlayerType(
  group: PositionGroupKey,
  categories: Record<DNACategoryKey, PlayerDNACategory>
): PlayerTypeResult {
  const s = (k: DNACategoryKey) => categories[k].score;
  const rules: { label: string; test: () => boolean; reason: () => string }[] =
    group === "attacker"
      ? [
          {
            label: "Målfarlig avslutare",
            test: () => (s("avslutning") ?? 0) >= 70 && (s("kreativitet") ?? 100) < 60,
            reason: () => `Avslutningsfarlighet ${s("avslutning")}, Kreativitet ${s("kreativitet")}`,
          },
          {
            label: "Målskapande anfallare",
            test: () => (s("kreativitet") ?? 0) >= 70 && (s("bollinvolvering") ?? 0) >= 55,
            reason: () => `Kreativitet ${s("kreativitet")}, Bollinvolvering ${s("bollinvolvering")}`,
          },
          {
            label: "Progressiv dribblare",
            test: () => (s("dribbling") ?? 0) >= 75,
            reason: () => `Dribbling & progression ${s("dribbling")}`,
          },
        ]
      : group === "midfielder"
        ? [
            {
              label: "Box-to-box-mittfältare",
              test: () => (s("duellspel") ?? 0) >= 65 && (s("forsvar") ?? 0) >= 65 && (s("bollinvolvering") ?? 0) >= 55,
              reason: () => `Duellspel ${s("duellspel")}, Defensivt arbete ${s("forsvar")}, Bollinvolvering ${s("bollinvolvering")}`,
            },
            {
              label: "Kreativ playmaker",
              test: () => (s("kreativitet") ?? 0) >= 70 && (s("bollinvolvering") ?? 0) >= 60,
              reason: () => `Kreativitet ${s("kreativitet")}, Bollinvolvering ${s("bollinvolvering")}`,
            },
            {
              label: "Bollvinnande mittfältare",
              test: () => (s("forsvar") ?? 0) >= 75 && (s("duellspel") ?? 0) >= 65,
              reason: () => `Defensivt arbete ${s("forsvar")}, Duellspel ${s("duellspel")}`,
            },
          ]
        : group === "defender"
          ? [
              {
                label: "Uppspelande försvarare",
                test: () => (s("bollinvolvering") ?? 0) >= 65 && ((s("dribbling") ?? 0) >= 60 || (s("kreativitet") ?? 0) >= 60),
                reason: () => `Bollinvolvering ${s("bollinvolvering")}`,
              },
              {
                label: "Renodlad försvarare",
                test: () => (s("duellspel") ?? 0) >= 65 && (s("forsvar") ?? 0) >= 65 && (s("bollinvolvering") ?? 100) < 55,
                reason: () => `Duellspel ${s("duellspel")}, Defensivt arbete ${s("forsvar")}`,
              },
            ]
          : [];

  const match = rules.find((r) => r.test());
  return match ? { label: match.label, reason: match.reason() } : { label: null, reason: null };
}

// ---------------------------------------------------------------------------
// computePlayerDNA
// ---------------------------------------------------------------------------

export async function computePlayerDNA(
  supabase: Supabase,
  params: { playerId: number; season: number }
): Promise<PlayerDNA> {
  const { data: seasonRow } = await supabase
    .from("season")
    .select("id, league_id, year")
    .eq("year", params.season)
    .maybeSingle();
  if (!seasonRow) return unavailable("Ingen data för den säsongen.");

  // Poolat över ALLA säsonger i samma liga (inte bara den valda) — se
  // filbeskrivningen. Fortfarande bara IFK/AIK, eftersom det är allt vi
  // importerar.
  const { data: rows } = await supabase
    .from("statistics")
    .select(
      "player_id, minutes_played, appearances, goals, assists, shots_total, shots_on_target, passes_key, passes_total, dribbles_attempts, dribbles_success, duels_won, duels_total, fouls_drawn, fouls_committed, tackles_total, tackles_interceptions, player:player_id(position), season:season_id(year)"
    )
    .eq("league_id", seasonRow.league_id)
    .returns<StatRow[]>();

  const allRows = (rows ?? []).filter((r) => hasPlayedSeason(r.appearances));
  const player = allRows.find((r) => r.player_id === params.playerId && r.season?.year === params.season);
  if (!player) return unavailable("Spelaren har ingen registrerad speltid den här säsongen.");

  const positionGroupInfo = getPositionGroup(player.player?.position);
  if (!positionGroupInfo) return unavailable("Okänd position — kan inte bygga en positionsjusterad profil.");
  if (positionGroupInfo.group === "goalkeeper") {
    return unavailable(
      "Vi har inte tillräcklig målvaktsspecifik data (räddningar, insläppta mål, clean sheets) för en Player DNA-profil ännu."
    );
  }

  const otherRows = allRows.filter((r) => r.player_id !== params.playerId);
  const samePosition = otherRows.filter((r) => getPositionGroup(r.player?.position)?.group === positionGroupInfo.group);
  const { peers, summary: peerSummary } = selectPeers(samePosition, positionGroupInfo.label, player.minutes_played);

  const peerPer90For = (key: keyof StatRow) =>
    peers.map((p) => per90(p[key] as number | null, p.minutes_played)).filter((v): v is number => v !== null);
  const playerPer90 = (key: keyof StatRow) => per90(player[key] as number | null, player.minutes_played);
  const peerDuelsWinRate = peers.map(duelsWinRate).filter((v): v is number => v !== null);

  const tierFor = (key: DNACategoryKey): "primary" | "secondary" =>
    PRIMARY_CATEGORIES[positionGroupInfo.group].includes(key) ? "primary" : "secondary";

  const categories: Record<DNACategoryKey, PlayerDNACategory> = {
    avslutning: buildCategory(tierFor("avslutning"), [
      buildMetric("Mål", playerPer90("goals"), peerPer90For("goals")),
      buildMetric("Skott", playerPer90("shots_total"), peerPer90For("shots_total")),
      buildMetric("Skott på mål", playerPer90("shots_on_target"), peerPer90For("shots_on_target")),
    ]),
    kreativitet: buildCategory(tierFor("kreativitet"), [
      buildMetric("Assist", playerPer90("assists"), peerPer90For("assists")),
      buildMetric("Nyckelpassningar", playerPer90("passes_key"), peerPer90For("passes_key")),
    ]),
    // Bara passningsvolym, inte -säkerhet: passes_accuracy saknas för 83-90%
    // av spelarna (se produktplanen) och kan därför inte benchmarkas. Det
    // här mäter alltså bollinvolvering, inte passningskvalitet — döpt
    // därefter istället för att låtsas mäta något vi inte kan.
    bollinvolvering: buildCategory(tierFor("bollinvolvering"), [
      buildMetric("Passningar", playerPer90("passes_total"), peerPer90For("passes_total")),
    ]),
    dribbling: buildCategory(tierFor("dribbling"), [
      buildMetric("Dribbelförsök", playerPer90("dribbles_attempts"), peerPer90For("dribbles_attempts")),
      buildMetric("Lyckade dribblingar", playerPer90("dribbles_success"), peerPer90For("dribbles_success")),
      buildMetric("Fällda fouls", playerPer90("fouls_drawn"), peerPer90For("fouls_drawn")),
    ]),
    duellspel: buildCategory(tierFor("duellspel"), [
      buildMetric("Vunna dueller", playerPer90("duels_won"), peerPer90For("duels_won")),
      buildMetric("Vinstprocent", duelsWinRate(player), peerDuelsWinRate, "%"),
    ]),
    forsvar: buildCategory(tierFor("forsvar"), [
      buildMetric("Tacklingar", playerPer90("tackles_total"), peerPer90For("tackles_total")),
      buildMetric("Interceptions", playerPer90("tackles_interceptions"), peerPer90For("tackles_interceptions")),
      buildMetric("Fouls begångna", playerPer90("fouls_committed"), peerPer90For("fouls_committed")),
    ]),
  };

  const ownTier = tierFromThresholds(player.minutes_played, 900, 450);
  const peerTier = tierFromThresholds(peers.length, 12, 6);
  const confidence: DNAConfidence = {
    tier: worseTier(ownTier, peerTier),
    peerLabel: peerSummary.label,
    peerCount: peerSummary.count,
    ownMinutes: player.minutes_played,
    ownTier,
    peerTier,
    minMinutesApplied: peerSummary.minMinutesApplied,
    pooledSeasons: [...new Set(allRows.map((r) => r.season?.year).filter((y): y is number => Boolean(y)))].sort(),
  };

  // Sammanfattning, insikter och spelartyp genereras ALDRIG på ett lågt
  // konfidensläge — en kort speltid mot en tunn peer-pool ger för mycket
  // brus för att skriva ut en mening eller en spelartyp som om det vore
  // säkert.
  const lowConfidence = confidence.tier === "låg";
  const playerType = lowConfidence ? { label: null, reason: null } : inferPlayerType(positionGroupInfo.group, categories);
  const keyCategories = lowConfidence ? null : identifyKeyCategories(categories);
  const summary = keyCategories ? buildSummary(playerType, categories, keyCategories, peerSummary.label) : null;
  const insights = keyCategories ? buildInsights(categories, keyCategories) : [];

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
