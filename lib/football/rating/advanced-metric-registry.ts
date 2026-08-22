/**
 * Fas 8 — dokumenterad måttregistry för det AVANCERADE (Sportmonks-källade)
 * lagret. Egen fil, ALDRIG importerad av lib/football/rating/metric-registry.ts
 * — samma medvetna separation som redan etablerad för scout-metrics.ts.
 * Ingen Sportmonks-källa refereras i OVR-formeln (metric-registry.ts/
 * categories.ts/position-rating-config.ts) förrän ett uttryckligt beslut
 * tas i en senare fas (planens Fas 13).
 *
 * Scopad till 2024–2026 — Sportmonks täcker inte Allsvenskan tidigare år.
 * Konsumerande kod MÅSTE dölja hela blocket för spelare/säsonger utan
 * täckning, aldrig visa en tom platshållare (samma regel som Player DNA:s
 * befintliga UI-princip).
 *
 * 14 mått valda enligt samma disciplin som ursprungliga Rating-registret
 * ("hellre 15–25 riktigt bra mått än 100 halvbra") — täckning verifierad
 * mot 16 905 rader (fixture_player_advanced_stats, 2024–2026) INNAN valet
 * gjordes, inte i efterhand:
 *   - Uteslutna pga för gles täckning för en pålitlig percentil:
 *     man_of_match (0,2%), error_lead_to_shot (1,4%), hit_woodwork (2,1%),
 *     clearance_offline (0,7%), turnovers (4,9%), big_chances_missed (7,1%),
 *     successful_crosses_pct (13,1%), big_chances_created (14,0%).
 *   - tackles_won_pct uteslöts AV ETT ANNAT SKÄL: fixture_player_advanced_stats
 *     saknar en tackles_total-nämnare (bara tackles_won-räkningen sparades i
 *     Fas 5) — att volymvikta procentsatsen korrekt (samma princip som
 *     passesAccuracyPct) kräver den nämnaren, som inte finns. Ersatt med
 *     tacklesWonPer90 (ren volym) istället för att gissa fram en nämnare.
 *   - duels_won_pct (Sportmonks-källa) uteslöts: bara 16,3% täckning OCH
 *     redundant med den befintliga, betydligt bättre täckta duelsWonPct i
 *     ORIGINAL-registret (fixture_player_stats-källa) — ingen anledning att
 *     duplicera med sämre data.
 */

export type AdvancedRatingCategoryKey = "shooting" | "passing" | "dribbling" | "defending";

export const ADVANCED_RATING_CATEGORY_LABELS: Record<AdvancedRatingCategoryKey, string> = {
  shooting: "Avslutning (avancerat)",
  passing: "Passning (avancerat)",
  dribbling: "Bollhantering (avancerat)",
  defending: "Försvarsspel (avancerat)",
};

export interface AdvancedRatingMetricDefinition {
  key: string;
  label: string;
  definition: string;
  formula: string;
  source: "fixture_player_advanced_stats";
  unit: "/90" | "%";
  population: string;
  percentileMethod: "empirisk_rank";
  minSample: string;
  category: AdvancedRatingCategoryKey;
  /** true om lägre värde är bättre (t.ex. "possession lost") — styr percentilriktning. */
  lowerIsBetter: boolean;
  /** Faktisk täckning i fixture_player_advanced_stats (2024–2026, 16 905 rader), verifierad inte antagen. */
  coverageNote: string;
  limitations: string;
}

const POPULATION_2024_PLUS =
  "Samma liga, positionsgrupp och EN säsong (2024, 2025 eller 2026 — Sportmonks-källan täcker inga tidigare säsonger), min. 450 minuter där underlaget räcker. ALDRIG poolat mot 2016–2023 (annan källa, ojämförbar täckning).";
const MIN_SAMPLE_NOTE = "MIN_PEER_MINUTES=450 / MIN_PEER_COUNT=4, samma trösklar som Player Rating/Player DNA.";

export const ADVANCED_RATING_METRICS: AdvancedRatingMetricDefinition[] = [
  {
    key: "xgPer90",
    label: "xG",
    definition: "Expected Goals per 90 minuter — den sammanlagda målsannolikheten för spelarens avslut.",
    formula: "sum(xg) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "shooting",
    lowerIsBetter: false,
    coverageNote: "46,7 % av raderna (villkorat — bara matcher med registrerade avslut).",
    limitations: "Sportmonks egen xG-modell, INTE samma modell som API-Footballs lagnivå-expected_goals (snittavvikelse 0,33 mål/lag/match uppmätt i Fas 4) — jämför inte de två rakt av.",
  },
  {
    key: "xgotPer90",
    label: "xGoT",
    definition: "Expected Goals on Target per 90 minuter — målsannolikhet bland skotten som var på mål.",
    formula: "sum(xgot) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "shooting",
    lowerIsBetter: false,
    coverageNote: "34,3 % av raderna.",
    limitations: "Kräver skott på mål — spelare med bara utanför-mål-skott saknar värde.",
  },
  {
    key: "passesFinalThirdPer90",
    label: "Passningar sista tredjedel",
    definition: "Passningar in i eller inom det avslutande tredjedelen av planen, per 90 minuter.",
    formula: "sum(passes_final_third) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    lowerIsBetter: false,
    coverageNote: "54,7 % av raderna.",
    limitations: "Volymmått — mäter inte om passningen faktiskt var progressiv eller bara sidledes inom tredjedelen.",
  },
  {
    key: "chancesCreatedPer90",
    label: "Målchanser skapade",
    definition: "Alla situationer spelaren var direkt inblandad i att skapa, per 90 minuter (bredare mått än nyckelpassningar).",
    formula: "sum(chances_created) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    lowerIsBetter: false,
    coverageNote: "26,2 % av raderna.",
    limitations: "Måttlig täckning — tolka enskilda spelares percentil försiktigt vid lågt antal matcher.",
  },
  {
    key: "longBallsPer90",
    label: "Långa bollar",
    definition: "Antal långa passningsförsök per 90 minuter.",
    formula: "sum(long_balls) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    lowerIsBetter: false,
    coverageNote: "71,1 % av raderna — en av de bäst täckta avancerade måtten.",
    limitations: "Volymmått, ingen kvalitetsbedömning av vem som togs emot bollen eller om det var rätt val.",
  },
  {
    key: "longBallsWonPct",
    label: "Långbollsprecision",
    definition: "Andel långa bollar som nådde en medspelare, volymviktat över säsongen.",
    formula: "sum(long_balls_won, PARAD med rader som har long_balls) / sum(long_balls) * 100 — volymviktat OCH parat (bugg hittad+fixad i Fas 8-verifiering: ovillkorad summering gav >100% för aerialsWonPct, samma fix tillämpad här förebyggande).",
    source: "fixture_player_advanced_stats",
    unit: "%",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    lowerIsBetter: false,
    coverageNote: "56,9 % av raderna har en icke-null nämnare.",
    limitations: "Kräver minst ett långbollsförsök — spelare helt utan försök saknar värde.",
  },
  {
    key: "possessionLostPer90",
    label: "Bollförluster",
    definition: "Antal gånger spelaren förlorade bollen till motståndaren, per 90 minuter. Lägre är bättre.",
    formula: "sum(possession_lost) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    lowerIsBetter: true,
    coverageNote: "65,7 % av raderna.",
    limitations: "En anfallare med mycket bollinnehav under press förlorar naturligt bollen oftare än en försvarare — jämförs bara inom samma positionsgrupp, men skillnaden kan ändå spegla roll snarare än kvalitet.",
  },
  {
    key: "touchesPer90",
    label: "Bollberöringar",
    definition: "Totalt antal gånger spelaren rörde bollen, per 90 minuter.",
    formula: "sum(touches) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "dribbling",
    lowerIsBetter: false,
    coverageNote: "84,6 % av raderna — bäst täckta avancerade måttet.",
    limitations: "Ett rent involveringsmått — säger inget om vad spelaren GJORDE med bollberöringarna.",
  },
  {
    key: "dispossessedPer90",
    label: "Frånspelad",
    definition: "Antal gånger spelaren blev av med bollen i en dribbling/bollföring, per 90 minuter. Lägre är bättre.",
    formula: "sum(dispossessed) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "dribbling",
    lowerIsBetter: true,
    coverageNote: "37,9 % av raderna.",
    limitations: "Skiljer sig konceptuellt från possessionLostPer90 (bollförlust vid dribbling specifikt, inte alla bollförluster) — Sportmonks egen distinktion, inte vår tolkning.",
  },
  {
    key: "ballRecoveryPer90",
    label: "Bollåtervinningar",
    definition: "Antal gånger spelaren återvann bollen åt sitt lag, per 90 minuter.",
    formula: "sum(ball_recovery) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    lowerIsBetter: false,
    coverageNote: "56,2 % av raderna.",
    limitations: "Bredare än tacklingar/interceptions — inkluderar t.ex. lösa bollar, inte bara aktiva erövringar.",
  },
  {
    key: "tacklesWonPer90",
    label: "Vunna tacklingar",
    definition: "Tacklingar spelaren vann bollen i, per 90 minuter.",
    formula: "sum(tackles_won) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    lowerIsBetter: false,
    coverageNote: "30,5 % av raderna.",
    limitations: "Ren volym, inte en andel — fixture_player_advanced_stats saknar en tackles_total-nämnare (bara vunna tacklingar sparades i Fas 5), så en träffprocent kan inte volymviktas korrekt än.",
  },
  {
    key: "aerialsWonPer90",
    label: "Vunna luftdueller",
    definition: "Vunna luftdueller per 90 minuter — en dueltyp som API-Footballs duels_total/duels_won inte kan särskilja.",
    formula: "sum(aerials_won) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    lowerIsBetter: false,
    coverageNote: "46,7 % av raderna.",
    limitations: "Naturligt lågt/obefintligt för många mittfältare/anfallare med lite luftspel — jämförs bara inom samma positionsgrupp, men även där varierar det med spelstil.",
  },
  {
    key: "aerialsWonPct",
    label: "Luftduellandel",
    definition: "Andel vunna luftdueller av totalt antal, volymviktat över säsongen.",
    formula: "sum(aerials_won, PARAD med rader som har aerials_total) / sum(aerials_total) * 100 — volymviktat OCH parat, se filhuvudets buggnotering.",
    source: "fixture_player_advanced_stats",
    unit: "%",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    lowerIsBetter: false,
    coverageNote: "19,0 % av raderna (samma villkorade täckning som aerials_total) — LÄGSTA täckningen bland de inkluderade måtten, tas med trots det pga unikt analytiskt värde (ingen annan källa i projektet mäter luftduellandel alls). Tolka med extra försiktighet vid lite speltid.",
    limitations: "Kräver minst ett luftduellförsök — många spelare (särskilt tekniska mittfältare) saknar helt värde här, vilket är korrekt (inte ett datafel) snarare än en svaghet att dölja.",
  },
  {
    key: "clearancesPer90",
    label: "Röjningar",
    definition: "Antal gånger spelaren röjde bollen bort från fara, per 90 minuter.",
    formula: "sum(clearances) / sum(minutes_played) * 90",
    source: "fixture_player_advanced_stats",
    unit: "/90",
    population: POPULATION_2024_PLUS,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    lowerIsBetter: false,
    coverageNote: "57,4 % av raderna.",
    limitations: "Ett högt antal kan spegla antingen ett bra försvarsspel ELLER ett lag som är mycket under tryck — samma dubbeltydighet som redan känd för tacklingsvolym.",
  },
];
