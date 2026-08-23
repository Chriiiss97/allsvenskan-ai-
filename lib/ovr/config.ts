/**
 * OVR v2 — all justerbar konfiguration på ett ställe.
 * =============================================================================
 * Beräkningslogiken (compute.ts) läser HÄRIFRÅN och innehåller inga egna tal.
 * Du ska kunna ändra vikter, ankarpunkter och k-värden utan att röra en enda
 * rad beräkningskod. Höj CONFIG_VERSION när du gör det — varje sparad rad i
 * player_ratings bär versionen som räknade fram den, så en omräkning alltid
 * går att härleda i efterhand.
 *
 * -----------------------------------------------------------------------------
 * VIKTIGT OM SKALAN — läs innan du jämför med något externt
 * -----------------------------------------------------------------------------
 * Det här är en INTERN ALLSVENSK SKALA. Den är inte, och kan inte vara,
 * jämförbar med FIFA/EA FC:s globala skala. En 84:a här betyder "top ~3 % i
 * sin positionsgrupp i Allsvenskan", ingenting annat. En 84:a i FIFA är ett
 * uttalande om världens alla spelare. Att sätta talen bredvid varandra är
 * meningslöst — hela referenspopulationen är en annan.
 *
 * Konkret: percentilen räknas ALLTID inom (positionsgrupp x säsong), aldrig
 * mot hela ligan och aldrig mot något utanför Allsvenskan. Ligakoefficienterna
 * nedan översätter statistik från andra ligor TILL den här skalan; de gör inte
 * skalan global.
 *
 * -----------------------------------------------------------------------------
 * TRE DATASANNINGAR SOM STYR MÅTTVALEN (verifierade mot databasen 2026-08-23)
 * -----------------------------------------------------------------------------
 * Inget av det här är gissat — allt är avstämt mot lagstatistiken i
 * fixture_team_stats, som är oberoende av spelarstatistiken.
 *
 * 1. passes_accuracy BYTER BETYDELSE mellan 2020 och 2021.
 *    T.o.m. 2019 är fältet en PROCENT (summan av spelarnas värden = 2,78x
 *    lagets antal träffsäkra passningar). Fr.o.m. 2021 är det ett ANTAL
 *    träffsäkra passningar (summan = lagets antal, kvot exakt 1,000).
 *    2020 är en blandning som inte går att reda ut per rad — se
 *    passAccuracyEra() nedan, där 2020 medvetet är "unavailable".
 *
 * 2. shots_total BYTER DEFINITION i samma veva. T.o.m. 2019 ingick blockerade
 *    skott, fr.o.m. 2021 inte (spelarsumman = lagets totalt minus blockerade,
 *    kvot 1,000). Samma spelare får ~32 % lägre skott/90 efter brottet.
 *    DÄRFÖR används shots_total inte alls i den här motorn — shots_on_target
 *    stämmer mot lagstatistiken med kvot 0,994–1,006 ALLA år och är det enda
 *    skottmått som tål en jämförelse över tid. Målkonvertering räknas därför
 *    som mål/skott på mål, inte mål/skott.
 *
 * 3. Tacklingar driver +70 % (1,03 -> 1,76 per 90) mellan 2019 och 2025 och
 *    brytningar driver nedåt (1,59 -> 0,86). Dueller har ett verkligt hål 2019
 *    (56 % täckning, ligasnitt 5,6 mot 9–10 alla andra år). Ingen av dessa
 *    kurvor är fotboll — det är datakvalitet som ändrar sig.
 *    DÄRFÖR byggs historiken (prior) i PERCENTILRUM, aldrig i råvärdesrum:
 *    "han var 82:a percentilen bland mittbackar 2019" är sant oavsett hur
 *    tacklingar råkade räknas det året. Se compute.ts:buildPrior.
 *
 * -----------------------------------------------------------------------------
 * MÅTT SOM SPECEN BAD OM MEN SOM DATAN INTE HAR
 * -----------------------------------------------------------------------------
 * Följande är medvetet BORTA, inte ersatta med en proxy i smyg:
 *  - Vunna nickdueller %: finns bara via Sportmonks 2024+, och aerials_total
 *    är ifyllt i 19 % av raderna — det går inte att räkna en procent på.
 *    Vikten är sammanslagen med vunna dueller % (CB 25->45, ST 10->20).
 *  - Tacklingar vunna %: API-Football ger bara försök, inte vunna/förlorade.
 *    Ersatt med tacklingar per 90 (CB).
 *  - Inlägg: Sportmonks 2024+, 44 % täckning. FB:s "nyckelpassningar/inlägg"
 *    är därför bara nyckelpassningar.
 *  - Felaktiga utspel som leder till chans (GK): error_lead_to_shot finns i
 *    1,4 % av raderna. Vikten (10) är fördelad på räddningsprocent och utspel.
 *  - xG/xA per spelare: xG finns via Sportmonks men bara 2024+ och bara för
 *    700 av 2 305 spelare. Ett mått som saknas för två tredjedelar av ligan
 *    kan inte viktas in utan att göra betyget beroende av vem som råkar vara
 *    mappad. Inte med i v2.
 *  - Progressiva passningar, tacklingar i sista tredjedelen: finns inte alls.
 */

import { lookupLeague } from "./league-registry";

export const CONFIG_VERSION = "ovr-v2.2.0";

// =============================================================================
// Positionsgrupper
// =============================================================================

export const POSITION_GROUPS = ["GK", "CB", "FB", "CM", "AM", "ST"] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  GK: "målvakter",
  CB: "mittbackar",
  FB: "ytterbackar",
  CM: "centrala mittfältare",
  AM: "offensiva mittfältare och ytter",
  ST: "anfallare",
};

/**
 * Hur många månader bakåt startelvapositionerna vägs över när primärposition
 * bestäms. Specen säger 12 månader — positionen ska följa var spelaren
 * FAKTISKT startat, inte player.position (ett statiskt fält som bara har fyra
 * grova värden och aldrig uppdateras när en spelare byter roll).
 */
export const POSITION_WINDOW_MONTHS = 12;

/**
 * Minsta andel av startminuterna i fönstret som sekundärpositionen måste ha
 * för att sparas alls. Under det är det brus — en enstaka nödlösning i en match.
 */
export const SECONDARY_POSITION_MIN_SHARE = 0.2;

// =============================================================================
// Mätvärden
// =============================================================================

export type MetricKey =
  | "goals_per90"
  | "assists_per90"
  | "goal_contributions_per90"
  | "shots_on_target_per90"
  | "conversion"
  | "key_passes_per90"
  | "pass_pct"
  | "pass_volume_per90"
  | "dribbles_completed_per90"
  | "dribble_success_pct"
  | "duels_won_pct"
  | "tackles_per90"
  | "interceptions_blocks_per90"
  | "ball_recoveries_per90"
  | "fouls_drawn_per90"
  | "cards_per90"
  | "fouls_committed_per90"
  | "offsides_per90"
  | "save_pct"
  | "goals_conceded_per90"
  | "clean_sheet_rate"
  | "penalty_saves_per90";

/**
 * k per mätvärdestyp, i 90-minutersekvivalenter (specens 4.1). Ju långsammare
 * ett mått stabiliserar sig, desto högre k — och desto mer väger historiken
 * för en spelare med få matcher. Målskytte stabiliserar långsammast; det är
 * precis därför en anfallare med 5 matcher och 4 mål inte ska rankas som
 * ligans bästa.
 */
export type StabilisationClass = "passing" | "duels" | "creation" | "shooting" | "goalkeeping";

export const STABILISATION: Record<StabilisationClass, number> = {
  passing: 6, // passningsprocent, passningsvolym
  duels: 8, // dribblingar, dueller, tacklingar, brytningar
  creation: 12, // nyckelpassningar, assist
  shooting: 15, // mål, skott, konvertering
  goalkeeping: 18, // räddningsprocent, insläppta
};

/**
 * `higherIsBetter: false` betyder att måttet inverteras innan percentilen
 * räknas (kort, insläppta mål, offsides, begångna frisparkar).
 *
 * `kind`:
 *  - "per90"  — räknemått normaliserat till 90 minuter
 *  - "ratio"  — kvot i intervallet 0–1, kräver minDenominator för att räknas
 *               som observerad alls (annars är den ren slump)
 */
export interface MetricDefinition {
  key: MetricKey;
  label: string;
  kind: "per90" | "ratio";
  higherIsBetter: boolean;
  stabilisation: StabilisationClass;
  minDenominator?: number;
  goalkeeperOnly?: boolean;
  /** Säsonger där måttet inte finns i källdatan. Percentilen blir null och vikten omfördelas. */
  unavailableSeasons?: readonly number[];
}

export const METRICS: Record<MetricKey, MetricDefinition> = {
  goals_per90: { key: "goals_per90", label: "Mål per 90", kind: "per90", higherIsBetter: true, stabilisation: "shooting" },
  assists_per90: { key: "assists_per90", label: "Assist per 90", kind: "per90", higherIsBetter: true, stabilisation: "creation" },
  goal_contributions_per90: { key: "goal_contributions_per90", label: "Mål + assist per 90", kind: "per90", higherIsBetter: true, stabilisation: "shooting" },
  shots_on_target_per90: { key: "shots_on_target_per90", label: "Skott på mål per 90", kind: "per90", higherIsBetter: true, stabilisation: "shooting" },
  // Mål / skott på mål — INTE mål / skott. Se datasanning 2 i filhuvudet.
  conversion: { key: "conversion", label: "Målkonvertering (mål per skott på mål)", kind: "ratio", higherIsBetter: true, stabilisation: "shooting", minDenominator: 5 },
  key_passes_per90: { key: "key_passes_per90", label: "Nyckelpassningar per 90", kind: "per90", higherIsBetter: true, stabilisation: "creation" },
  // 2020 saknas medvetet — fältet byter betydelse mitt i säsongen. Se datasanning 1.
  pass_pct: { key: "pass_pct", label: "Passningsprocent", kind: "ratio", higherIsBetter: true, stabilisation: "passing", minDenominator: 100, unavailableSeasons: [2020] },
  pass_volume_per90: { key: "pass_volume_per90", label: "Passningsvolym per 90", kind: "per90", higherIsBetter: true, stabilisation: "passing" },
  dribbles_completed_per90: { key: "dribbles_completed_per90", label: "Lyckade dribblingar per 90", kind: "per90", higherIsBetter: true, stabilisation: "duels" },
  dribble_success_pct: { key: "dribble_success_pct", label: "Dribblingsframgång", kind: "ratio", higherIsBetter: true, stabilisation: "duels", minDenominator: 15 },
  duels_won_pct: { key: "duels_won_pct", label: "Vunna dueller", kind: "ratio", higherIsBetter: true, stabilisation: "duels", minDenominator: 40 },
  tackles_per90: { key: "tackles_per90", label: "Tacklingar per 90", kind: "per90", higherIsBetter: true, stabilisation: "duels" },
  interceptions_blocks_per90: { key: "interceptions_blocks_per90", label: "Brytningar + blockeringar per 90", kind: "per90", higherIsBetter: true, stabilisation: "duels" },
  ball_recoveries_per90: { key: "ball_recoveries_per90", label: "Bollvinster per 90", kind: "per90", higherIsBetter: true, stabilisation: "duels" },
  fouls_drawn_per90: { key: "fouls_drawn_per90", label: "Framspelade frisparkar per 90", kind: "per90", higherIsBetter: true, stabilisation: "duels" },
  cards_per90: { key: "cards_per90", label: "Kort per 90", kind: "per90", higherIsBetter: false, stabilisation: "duels" },
  fouls_committed_per90: { key: "fouls_committed_per90", label: "Begångna frisparkar per 90", kind: "per90", higherIsBetter: false, stabilisation: "duels" },
  // Offsides finns inte i källdatan före 2020 — inte "0", utan inte insamlat.
  offsides_per90: {
    key: "offsides_per90",
    label: "Offside per 90",
    kind: "per90",
    higherIsBetter: false,
    stabilisation: "duels",
    unavailableSeasons: [2016, 2017, 2018, 2019],
  },
  save_pct: { key: "save_pct", label: "Räddningsprocent", kind: "ratio", higherIsBetter: true, stabilisation: "goalkeeping", minDenominator: 15, goalkeeperOnly: true },
  goals_conceded_per90: { key: "goals_conceded_per90", label: "Insläppta mål per 90", kind: "per90", higherIsBetter: false, stabilisation: "goalkeeping", goalkeeperOnly: true },
  clean_sheet_rate: { key: "clean_sheet_rate", label: "Hållna nollor", kind: "ratio", higherIsBetter: true, stabilisation: "goalkeeping", minDenominator: 3, goalkeeperOnly: true },
  penalty_saves_per90: { key: "penalty_saves_per90", label: "Straffräddningar per 90", kind: "per90", higherIsBetter: true, stabilisation: "goalkeeping", goalkeeperOnly: true },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/**
 * passes_accuracy-fältets betydelse per säsong. Se datasanning 1 i filhuvudet.
 * Aggregeringslagret läser den här och räknar därefter.
 */
export type PassAccuracyEra = "percentage" | "accurate_count" | "unavailable";

export function passAccuracyEra(seasonYear: number): PassAccuracyEra {
  if (seasonYear <= 2019) return "percentage";
  if (seasonYear === 2020) return "unavailable";
  return "accurate_count";
}

// =============================================================================
// Vikter per positionsgrupp
// =============================================================================

export interface PositionWeights {
  weights: Partial<Record<MetricKey, number>>;
  rationale: string;
  /** Avvikelser från den ursprungliga specen och varför. */
  deviations: string;
}

export const POSITION_WEIGHTS: Record<PositionGroup, PositionWeights> = {
  GK: {
    weights: {
      save_pct: 40,
      goals_conceded_per90: 20,
      clean_sheet_rate: 15,
      penalty_saves_per90: 5,
      pass_pct: 20,
    },
    rationale:
      "En målvakts kärnuppgift är att rädda skott — räddningsprocent väger tyngst. Insläppta per 90 fångar lagkontexten, hållna nollor belönar matchvinnande insatser, och utspelet väger tyngre än historiskt eftersom moderna målvakter är lagets första uppspelare.",
    deviations:
      "Specens 'felaktiga utspel som leder till chans' (10) är struken — error_lead_to_shot finns i 1,4 % av raderna. Vikten är fördelad på räddningsprocent (35->40) och utspel (15->20).",
  },
  CB: {
    weights: {
      duels_won_pct: 45,
      interceptions_blocks_per90: 15,
      tackles_per90: 15,
      pass_pct: 15,
      goal_contributions_per90: 5,
      cards_per90: 3,
      fouls_committed_per90: 2,
    },
    rationale:
      "En mittback bedöms först och främst på om han vinner sina dueller. Brytningar och blockeringar mäter positionsspel och läsning; tacklingar mäter aktiv bollvinst. Passningsprocent fångar uppspelet. Mål och assist väger lite men inte noll — fasta situationer.",
    deviations:
      "Specens vunna nickdueller % (20) är sammanslagen med vunna dueller % (25 -> 45): nickduellsdata finns bara 2024+ och aerials_total är ifyllt i 19 % av raderna. Specens 'tacklingar vunna %' (15) är ersatt av tacklingar per 90 — källan ger bara försök, inte utfall.",
  },
  FB: {
    weights: {
      duels_won_pct: 20,
      ball_recoveries_per90: 20,
      dribbles_completed_per90: 10,
      key_passes_per90: 15,
      pass_pct: 15,
      goal_contributions_per90: 15,
      cards_per90: 5,
    },
    rationale:
      "En ytterback ska både försvara sin kant och bidra framåt — därför nästan jämn vikt mellan defensiv bollvinst (40) och offensivt bidrag (40). Passningsprocent fångar att kanten är där bollen tappas oftast.",
    deviations: "Inlägg saknas före 2024 (Sportmonks, 44 % täckning) — posten 'nyckelpassningar/inlägg' är bara nyckelpassningar.",
  },
  CM: {
    weights: {
      pass_pct: 20,
      key_passes_per90: 15,
      pass_volume_per90: 10,
      ball_recoveries_per90: 20,
      duels_won_pct: 15,
      dribbles_completed_per90: 10,
      goal_contributions_per90: 10,
    },
    rationale:
      "En central mittfältare länkar spelet — passningskvalitet, -volym och -farlighet väger tillsammans 45. Bollvinster väger lika tungt som i en renodlad defensiv roll eftersom omställningsögonblicket avgörs på mittfältet.",
    deviations: "Ingen — hela specens CM-lista finns i datan.",
  },
  AM: {
    weights: {
      key_passes_per90: 20,
      assists_per90: 15,
      dribbles_completed_per90: 12,
      dribble_success_pct: 8,
      goals_per90: 15,
      shots_on_target_per90: 10,
      fouls_drawn_per90: 10,
      pass_pct: 10,
    },
    rationale:
      "En offensiv mittfältare eller ytter mäts på vad han skapar åt andra (35) före vad han gör själv (25). Dribbling är uppdelad i volym och träffsäkerhet så att en spelare som dribblar mycket och tappar mycket inte belönas för volymen ensam.",
    deviations:
      "Specens samlade dribblingspost (20) är uppdelad 12/8 mellan volym och lyckandegrad, vilket är vad specens egen formulering 'dribblingar lyckade per 90 + lyckandegrad' beskriver.",
  },
  ST: {
    weights: {
      goals_per90: 30,
      shots_on_target_per90: 15,
      conversion: 15,
      duels_won_pct: 20,
      goal_contributions_per90: 15,
      offsides_per90: 5,
    },
    rationale:
      "En anfallare bedöms på mål — 30, den enskilt tyngsta posten i hela motorn. Skott på mål och konvertering skiljer den som skapar sina lägen från den som får dem serverade. Duellspel fångar den fysiska referenspunkten längst fram.",
    deviations:
      "Specens vunna nickdueller % (10) är sammanslagen med vunna dueller % (10 -> 20), samma skäl som för CB. Konvertering är mål/skott på mål, inte mål/skott — se datasanning 2. Specens 'assist + nyckelpassningar' (15) använder mål+assist-måttet, eftersom nyckelpassningar för anfallare är glest och brusigt.",
  },
};

/** Delbetygen (specens 3.1) — viktade delmängder av samma mått. */
export type SubscoreKey = "finishing" | "passing" | "dribbling" | "defending" | "duels" | "goalkeeping";

export const SUBSCORE_KEYS: readonly SubscoreKey[] = ["finishing", "passing", "dribbling", "defending", "duels", "goalkeeping"];

export const SUBSCORE_WEIGHTS: Record<SubscoreKey, Partial<Record<MetricKey, number>>> = {
  finishing: { goals_per90: 45, shots_on_target_per90: 25, conversion: 30 },
  passing: { pass_pct: 40, key_passes_per90: 35, pass_volume_per90: 25 },
  dribbling: { dribbles_completed_per90: 55, dribble_success_pct: 25, fouls_drawn_per90: 20 },
  defending: { interceptions_blocks_per90: 40, tackles_per90: 35, ball_recoveries_per90: 25 },
  duels: { duels_won_pct: 70, fouls_committed_per90: 15, cards_per90: 15 },
  goalkeeping: { save_pct: 45, goals_conceded_per90: 25, clean_sheet_rate: 20, penalty_saves_per90: 10 },
};

// =============================================================================
// Skalan — percentil till OVR
// =============================================================================

/**
 * Ankarpunkter, styckevis linjär och monoton. Percentilen mappas ALDRIG
 * linjärt — då hamnar medelspelaren på 50 och skalan känns fel.
 *
 * Effekten: en genomsnittlig allsvensk startspelare landar runt 68, en riktigt
 * bra allsvensk spelare 79–84, en generationsspelare 86+.
 *
 * Taket nås sällan i praktiken: med ~60 spelare i en positionsgrupp är högsta
 * uppnåeliga percentil ~99,2, vilket ger ~87,6. Det är avsiktligt — 88+ ska
 * kräva en säsong som sticker ut mot en stor grupp.
 */
export const SCALE_ANCHORS: readonly { percentile: number; ovr: number }[] = [
  { percentile: 1, ovr: 52 },
  { percentile: 10, ovr: 60 },
  { percentile: 25, ovr: 64 },
  { percentile: 50, ovr: 68 },
  { percentile: 75, ovr: 74 },
  { percentile: 90, ovr: 79 },
  { percentile: 97, ovr: 84 },
  { percentile: 99.5, ovr: 88 },
];

export const OVR_FLOOR = 48;
export const OVR_CAP = 91;

// =============================================================================
// Historik, prior och shrinkage
// =============================================================================

/**
 * Tidsvikter för prior (specens 4.2). Index = antal säsonger bakåt räknat från
 * den säsong som betygsätts. Äldre än fyra säsonger ignoreras helt.
 */
export const SEASON_WEIGHTS: readonly number[] = [1.0, 0.55, 0.3, 0.15];

/**
 * Minuter en historisk säsong måste ha för att räknas fullt ut i prior. Under
 * det skalas säsongens vikt linjärt ned. Specen nämner inte detta, men utan
 * det väger en inhoppssäsong på 150 minuter lika tungt som en hel säsong på
 * 2 500 — vilket gör prior lika brusig som det den ska stabilisera.
 */
export const PRIOR_FULL_WEIGHT_MINUTES = 900;

/**
 * Referensfördelningen för percentiler byggs på så här många säsonger bakåt
 * (inklusive den aktuella). Motiv: GK-gruppen är bara 20–29 spelare per säsong,
 * där ett enda rangsteg är 3,4–5,0 percentilenheter — alltså 2–4 OVR mellan två
 * grannar i tabellen. Med tre säsonger poolade blir fördelningen tät nog för
 * att percentilen ska betyda något.
 */
export const REFERENCE_POOL_SEASONS = 3;

/**
 * Minuter som krävs för att ingå i referensfördelningen (peer-poolen).
 *
 * OBS: det här är INTE en tröskel för att FÅ ett betyg. Specen föreslog att
 * spelare under 270 minuter skulle "gå direkt på prior", men shrinkage-formeln
 * gör redan exakt det, mjukt: med n = 1 och k = 15 hamnar prior på 94 % av
 * vikten av sig själv. En hård tröskel ovanpå skulle bara skapa ett hopp i
 * betyget vid 270 minuter. Alla spelare med minst en spelad minut får ett
 * betyg; hur mycket det vilar på historik syns i prior_weight och confidence.
 */
export const PEER_MIN_MINUTES = 270;

/** Under så här många peers är percentilen inte meningsfull ens efter poolning. */
export const MIN_PEERS_PER_GROUP = 12;

/**
 * Hur många z-enheter en fördubbling av ligakoefficienten motsvarar när en
 * utländsk prestation översätts till allsvensk percentil.
 *
 * Med 1.6: en medianspelare (p50) i Premier League (1.55) motsvarar p76 i
 * Allsvenskan; en p90-spelare i Superettan (0.70) motsvarar p76. Rätt
 * storleksordning — men en kvalificerad gissning, inte kalibrerad mot faktiska
 * övergångsutfall. Samma varning som för koefficienterna själva.
 */
export const LEAGUE_Z_PER_LOG_COEFFICIENT = 1.6;

// =============================================================================
// Ålderskurva
// =============================================================================

/**
 * Åldersjustering av PRIOR, uttryckt direkt i OVR-enheter (specens 4.5).
 * Topp 26–28, stigande från 18, fallande efter 30. Medvetet mild — max ±4.
 *
 * Tillämpas på prior, inte på det observerade: poängen är att en 19-årings
 * förra säsong underskattar var han är NU, och en 34-årings förra säsong
 * överskattar det. Vad de faktiskt gjort den här säsongen rörs aldrig.
 */
export const AGE_CURVE: readonly { age: number; adjustment: number }[] = [
  { age: 17, adjustment: 4.0 },
  { age: 19, adjustment: 3.0 },
  { age: 21, adjustment: 1.8 },
  { age: 23, adjustment: 0.8 },
  { age: 25, adjustment: 0.2 },
  { age: 26, adjustment: 0.0 },
  { age: 28, adjustment: 0.0 },
  { age: 30, adjustment: -0.8 },
  { age: 32, adjustment: -2.0 },
  { age: 34, adjustment: -3.2 },
  { age: 36, adjustment: -4.0 },
];

export const AGE_PEAK = 27;

// =============================================================================
// Confidence
// =============================================================================

export const CONFIDENCE_TIERS = { low: 0.4, medium: 0.7 } as const;

export type ConfidenceTier = "låg" | "medel" | "hög";

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence < CONFIDENCE_TIERS.low) return "låg";
  if (confidence <= CONFIDENCE_TIERS.medium) return "medel";
  return "hög";
}

// =============================================================================
// Form — separat från OVR, blandas ALDRIG in i det
// =============================================================================

/**
 * Form räknas på de senaste matcherna utan shrinkage och lever helt vid sidan
 * om OVR. OVR ska vara trögt och stabilt; form ska vara snabbt och brusigt.
 * Att blanda ihop dem gör båda värdelösa.
 */
export const FORM_MATCH_COUNT = 5;
export const FORM_MIN_MINUTES_PER_MATCH = 20;
export const FORM_RANGE = 10; // -10..+10

// =============================================================================
// Ligakoefficienter — startvärden
// =============================================================================

/**
 * Skalar om statistik från andra ligor till allsvensk nivå (Allsvenskan = 1.00).
 * Ligger även i Supabase-tabellen league_coefficients, som är den källa
 * batch-scriptet faktiskt läser — de här värdena är seed-data för den tabellen.
 *
 * ALLA ÄR KVALIFICERADE GISSNINGAR, inte kalibrerade mot något utfall. De är
 * markerade calibrated = false i databasen och ska förbli det tills någon
 * faktiskt mäter övergångar in i och ut ur Allsvenskan.
 *
 * league_external_id är API-Footballs id och matchar player_career_stint.
 */
export interface LeagueCoefficientSeed {
  league_external_id: number;
  league_name: string;
  country: string | null;
  coefficient: number;
  note?: string;
}

export const LEAGUE_COEFFICIENTS: readonly LeagueCoefficientSeed[] = [
  { league_external_id: 113, league_name: "Allsvenskan", country: "Sweden", coefficient: 1.0, note: "Referens" },
  { league_external_id: 39, league_name: "Premier League", country: "England", coefficient: 1.55 },
  { league_external_id: 140, league_name: "La Liga", country: "Spain", coefficient: 1.45 },
  { league_external_id: 135, league_name: "Serie A", country: "Italy", coefficient: 1.4 },
  { league_external_id: 78, league_name: "Bundesliga", country: "Germany", coefficient: 1.4 },
  { league_external_id: 61, league_name: "Ligue 1", country: "France", coefficient: 1.35 },
  { league_external_id: 88, league_name: "Eredivisie", country: "Netherlands", coefficient: 1.2 },
  { league_external_id: 94, league_name: "Primeira Liga", country: "Portugal", coefficient: 1.2 },
  { league_external_id: 40, league_name: "Championship", country: "England", coefficient: 1.2 },
  { league_external_id: 144, league_name: "Jupiler Pro League", country: "Belgium", coefficient: 1.15 },
  { league_external_id: 253, league_name: "Major League Soccer", country: "USA", coefficient: 1.05 },
  { league_external_id: 119, league_name: "Superliga", country: "Denmark", coefficient: 1.05 },
  { league_external_id: 103, league_name: "Eliteserien", country: "Norway", coefficient: 0.95 },
  { league_external_id: 114, league_name: "Superettan", country: "Sweden", coefficient: 0.7 },
  { league_external_id: 244, league_name: "Veikkausliiga", country: "Finland", coefficient: 0.72 },

  // Nedan: ligor som INTE fanns i specens lista men som har mycket speltid i
  // vår faktiska player_career_stint-data. Utan dem hade de behandlats som
  // okända (DEFAULT_LEAGUE_COEFFICIENT) trots att de är väl kända storheter.
  { league_external_id: 79, league_name: "2. Bundesliga", country: "Germany", coefficient: 1.1 },
  { league_external_id: 136, league_name: "Serie B", country: "Italy", coefficient: 1.0 },
  { league_external_id: 62, league_name: "Ligue 2", country: "France", coefficient: 0.95 },
  { league_external_id: 203, league_name: "Süper Lig", country: "Turkey", coefficient: 1.05 },
  { league_external_id: 197, league_name: "Super League 1", country: "Greece", coefficient: 0.95 },
  { league_external_id: 207, league_name: "Super League", country: "Switzerland", coefficient: 1.0 },
  { league_external_id: 179, league_name: "Premiership", country: "Scotland", coefficient: 0.95 },
  { league_external_id: 106, league_name: "Ekstraklasa", country: "Poland", coefficient: 0.9 },
  { league_external_id: 235, league_name: "Premier League", country: "Russia", coefficient: 1.0 },
  { league_external_id: 89, league_name: "Eerste Divisie", country: "Netherlands", coefficient: 0.8 },
  { league_external_id: 120, league_name: "1. Division", country: "Denmark", coefficient: 0.75 },
  { league_external_id: 104, league_name: "1. Division", country: "Norway", coefficient: 0.7 },
  { league_external_id: 164, league_name: "Úrvalsdeild", country: "Iceland", coefficient: 0.55 },
  { league_external_id: 255, league_name: "USL Championship", country: "USA", coefficient: 0.65 },
  { league_external_id: 271, league_name: "NB I", country: "Hungary", coefficient: 0.85 },
  { league_external_id: 318, league_name: "1. Division", country: "Cyprus", coefficient: 0.75 },
  { league_external_id: 564, league_name: "Ettan - Södra", country: "Sweden", coefficient: 0.45 },
  { league_external_id: 1055, league_name: "Ettan - Relegation Round", country: "Sweden", coefficient: 0.45 },

  // Europaspel: klubblagsnivån är hög men urvalet extremt snedvridet (bara lag
  // som kvalificerat sig). Meriterande, men inte en liga med jämförbar spridning.
  { league_external_id: 2, league_name: "UEFA Champions League", country: "World", coefficient: 1.5 },
  { league_external_id: 3, league_name: "UEFA Europa League", country: "World", coefficient: 1.25 },
  { league_external_id: 848, league_name: "UEFA Europa Conference League", country: "World", coefficient: 1.1 },
];

/**
 * Är en liga användbar som underlag för ett betyg?
 *
 * Två villkor måste båda vara uppfyllda:
 *
 *  1. Den ska vara SERIESPEL enligt ligaregistret (league-registry.ts, genererad
 *     ur den faktiska datan). Cuper blandar divisioner i samma tabell — en
 *     allsvensk klubb möter ett division 3-lag i Svenska Cupen — och säger
 *     nästan ingenting om nivå. Träningsmatcher är inte tävlingsspel alls;
 *     "Friendlies Clubs" (7 340 minuter i vår data) drog i en tidig körning ner
 *     en spelares betyg med 3,9 OVR. Ungdoms- och reservserier mäter en annan
 *     population.
 *
 *  2. Den ska ha en koefficient i LEAGUE_COEFFICIENTS ovan.
 *
 * Saknas koefficienten är ligan OANVÄNDBAR — inte "0,6". Tidigare fanns en
 * DEFAULT_LEAGUE_COEFFICIENT på 0,6 som tyst tillämpades på varje okänd liga,
 * vilket gjorde att 19 % av det återförda underlaget 2025 vilade på en siffra
 * ingen bestämt. Hellre en synlig lucka än ett osynligt antagande: sådana
 * sejourer redovisas i historical_evidence.unrated_leagues och sänker
 * confidence, men rör aldrig betyget.
 *
 * Det gäller stora serier — League One (44 518 min), J1 League (41 443),
 * Segunda División (39 323), österrikiska Bundesliga (38 992, id 218, INTE att
 * förväxla med tyska 78). De väntar på en kalibrering värd namnet, inte på en
 * gissning.
 */
export interface LeagueUsability {
  usable: boolean;
  coefficient: number | null;
  reason: "ok" | "cup" | "friendly" | "youth" | "no_coefficient" | "unknown_league";
}

const COEFFICIENT_BY_ID = new Map(LEAGUE_COEFFICIENTS.map((l) => [l.league_external_id, l.coefficient]));

export function leagueUsability(leagueExternalId: number): LeagueUsability {
  const entry = lookupLeague(leagueExternalId);
  if (!entry) return { usable: false, coefficient: null, reason: "unknown_league" };
  if (entry.kind !== "league") {
    return { usable: false, coefficient: null, reason: entry.kind };
  }
  const coefficient = COEFFICIENT_BY_ID.get(leagueExternalId);
  if (coefficient === undefined) return { usable: false, coefficient: null, reason: "no_coefficient" };
  return { usable: true, coefficient, reason: "ok" };
}

/**
 * Hur hårt confidence sänks när en spelares speltid till stor del ligger i
 * ligor vi inte kan värdera. Ett betyg som bortser från halva spelarens säsong
 * är mindre att lita på än ett som inte gör det — även om det som finns kvar
 * är korrekt räknat.
 *
 * confidence multipliceras med (1 - UNRATED_CONFIDENCE_PENALTY * andel).
 */
export const UNRATED_CONFIDENCE_PENALTY = 0.5;

// =============================================================================
// Självkontroller — körs vid modul-load, fail fast
// =============================================================================

function assertConfigConsistency(): void {
  for (const [group, cfg] of Object.entries(POSITION_WEIGHTS)) {
    const sum = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1e-9) {
      throw new Error(`config.ts: vikterna för ${group} summerar till ${sum}, inte 100.`);
    }
    for (const key of Object.keys(cfg.weights) as MetricKey[]) {
      if (!METRICS[key]) throw new Error(`config.ts: ${group} viktar okänt mått "${key}".`);
      const isGk = group === "GK";
      if (METRICS[key].goalkeeperOnly && !isGk) {
        throw new Error(`config.ts: ${group} viktar målvaktsmåttet "${key}".`);
      }
      if (!METRICS[key].goalkeeperOnly && isGk && key !== "pass_pct") {
        throw new Error(`config.ts: GK viktar utespelarmåttet "${key}".`);
      }
    }
  }
  for (const [sub, weights] of Object.entries(SUBSCORE_WEIGHTS)) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1e-9) {
      throw new Error(`config.ts: delbetyget ${sub} summerar till ${sum}, inte 100.`);
    }
  }
  for (let i = 1; i < SCALE_ANCHORS.length; i++) {
    if (SCALE_ANCHORS[i].percentile <= SCALE_ANCHORS[i - 1].percentile) {
      throw new Error("config.ts: SCALE_ANCHORS percentiler måste vara strikt stigande.");
    }
    if (SCALE_ANCHORS[i].ovr <= SCALE_ANCHORS[i - 1].ovr) {
      throw new Error("config.ts: SCALE_ANCHORS ovr måste vara strikt stigande (monoton mappning).");
    }
  }
  for (let i = 1; i < AGE_CURVE.length; i++) {
    if (AGE_CURVE[i].age <= AGE_CURVE[i - 1].age) {
      throw new Error("config.ts: AGE_CURVE måste vara sorterad på stigande ålder.");
    }
  }
  const maxAgeEffect = Math.max(...AGE_CURVE.map((p) => Math.abs(p.adjustment)));
  if (maxAgeEffect > 4) {
    throw new Error(`config.ts: ålderskurvan har effekt ${maxAgeEffect} OVR — specens tak är 4.`);
  }
  const seen = new Set<number>();
  for (const l of LEAGUE_COEFFICIENTS) {
    if (seen.has(l.league_external_id)) {
      throw new Error(`config.ts: dubblerad ligakoefficient för external_id ${l.league_external_id}.`);
    }
    seen.add(l.league_external_id);

    // Varje id måste stämma mot ligaregistret, som är genererat ur den
    // faktiska datan. Utan den här kontrollen kunde tre av tolv uteslutna
    // cup-id vara gissade — vilket de var, och två av dem pekade på riktiga
    // ligor. Se league-registry.ts.
    const entry = lookupLeague(l.league_external_id);
    if (!entry) continue; // Allsvenskan själv finns inte i career-stint-datan.
    if (entry.name.toLowerCase() !== l.league_name.toLowerCase()) {
      throw new Error(
        `config.ts: id ${l.league_external_id} heter "${entry.name}" i datan, inte "${l.league_name}".`
      );
    }
    if (entry.kind !== "league") {
      throw new Error(
        `config.ts: id ${l.league_external_id} ("${entry.name}") är ${entry.kind}, inte seriespel — får ingen koefficient.`
      );
    }
  }
}

assertConfigConsistency();

// =============================================================================
// Neutral prior — spelare helt utan historik
// =============================================================================

/**
 * Prior för en spelare som saknar historik helt (specens 4.2: "använd
 * positionsgruppens medianvärde och sätt confidence lågt").
 *
 * Utan den här regeln får en nykomling sitt obearbetade stickprov rakt in i
 * betyget: en anfallare som gjorde mål på 53 minuter i sin första match blir
 * ligans bästa spelare. Det var precis vad den första körningen av motorn
 * gjorde innan regeln fanns på plats.
 */
export const NEUTRAL_PRIOR_PERCENTILE = 50;

/**
 * En neutral prior bär mindre information än en verklig, och ska därför inte
 * dra lika hårt. Den räknas med halva mätvärdets k.
 *
 * Skälet: med fullt k skulle en genuin nykomling med en HEL säsong bakom sig
 * (n = 20, k = 8) fortfarande få 29 % av betyget från ett antagande om att han
 * är medelmåttig — trots att vi faktiskt sett honom spela 1 800 minuter. Med
 * halva k blir det 17 %, samtidigt som spelaren med 53 minuter fortfarande
 * hamnar på 93 % prior. Det är avvägningen: skydda mot små stickprov utan att
 * straffa den som faktiskt spelat.
 */
export const NEUTRAL_PRIOR_K_FACTOR = 0.5;

/**
 * Minsta antal matcher med speltid för att ett formvärde ska räknas fram alls.
 * Under det är "form" bara en enskild match, och att presentera det som en
 * trend vore att låtsas veta något vi inte vet.
 */
export const FORM_MIN_MATCHES = 3;

// =============================================================================
// Arketyper — trösklar
// =============================================================================

/**
 * Trösklar för arketypmatchning, uttryckta i OVR-enheter eftersom det är så
 * delbetygen lagras.
 *
 * Den gamla motorn använde percentiler (80 / 70 / 60). Omräknat genom
 * ankarkurvan motsvarar de ungefär 76 / 73 / 70 på OVR-skalan — samma
 * stränghet, uttryckt i den enhet talen faktiskt har. Att blanda ihop de två
 * hade gjort varje arketyp träffbar för nästan hela ligan, eftersom OVR 80 är
 * en percentil runt 93.
 *
 * Expertbedömda, precis som vikterna. Inte anpassade mot löner eller resultat.
 */
export const ARCHETYPE_THRESHOLDS = {
  /** Utmärker sig tydligt — motsvarar ~80:e percentilen. */
  standout: 76,
  /** Stark, används i kombinationskrav — ~70:e percentilen. */
  strong: 73,
  /** Golvet för "ingen svag sida" — ~60:e percentilen. */
  solid: 70,
} as const;
