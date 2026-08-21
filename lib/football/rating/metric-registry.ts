/**
 * Player Rating — dokumenterad måttregistry (Level 2/3).
 *
 * Scopead till Player Rating, INTE en gemensam registry med Player DNA
 * eller Scout:s befintliga filter — DNA är redan skeppad och verifierad
 * mot `statistics`; att tvinga in den i samma registry hade krävt
 * per-konsument-källöverstyrning på varje rad utan verklig nytta nu. En
 * dokumenterad avgränsning, inte en genväg.
 *
 * "Vikt" per mått specificeras INTE här — inom en kategori väger alla
 * mått lika (medelvärde av percentiler, samma mönster som
 * player-dna.ts:s buildCategory). Kategori-mot-kategori-vikter (t.ex.
 * SHOOTING 40 % för anfallare) finns i position-rating-config.ts, en
 * annan nivå i pipelinen.
 */

export type RatingCategoryKey = "shooting" | "passing" | "dribbling" | "defending";

export const RATING_CATEGORY_LABELS: Record<RatingCategoryKey, string> = {
  shooting: "Avslutning",
  passing: "Passning",
  dribbling: "Dribbling",
  defending: "Försvarsspel",
};

export interface RatingMetricDefinition {
  key: string;
  label: string;
  definition: string;
  formula: string;
  source: "fixture_player_stats";
  unit: "/90" | "%";
  population: string;
  percentileMethod: "empirisk_rank";
  minSample: string;
  /** Alltid "empirisk_rank": andel peers med värde ≤ spelarens — se lib/football/percentile.ts. */
  category: RatingCategoryKey;
  limitations: string;
}

const POPULATION = "Samma liga, säsong och positionsgrupp (Målvakt/Försvarare/Mittfältare/Anfallare), min. 450 minuter där underlaget räcker — se lib/football/position-group.ts.";
const MIN_SAMPLE_NOTE = "MIN_PEER_MINUTES=450 / MIN_PEER_COUNT=4, samma trösklar som Player DNA (position-group.ts).";

export const RATING_METRICS: RatingMetricDefinition[] = [
  {
    key: "goalsPer90",
    label: "Mål",
    definition: "Antal mål per 90 spelade minuter.",
    formula: "sum(goals) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "shooting",
    limitations: "Ingen xG — kan inte skilja på förtjänta och tursamma mål.",
  },
  {
    key: "shotsTotalPer90",
    label: "Skott",
    definition: "Totalt antal skott per 90 minuter.",
    formula: "sum(shots_total) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "shooting",
    limitations: "Mäter volym, inte skottkvalitet (ingen skottplacering/avstånd i källdatan).",
  },
  {
    key: "shotsOnTargetPer90",
    label: "Skott på mål",
    definition: "Skott på mål per 90 minuter.",
    formula: "sum(shots_on_target) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "shooting",
    limitations: "Samma volymbegränsning som skott totalt.",
  },
  {
    key: "passesTotalPer90",
    label: "Passningar",
    definition: "Totalt antal passningsförsök per 90 minuter.",
    formula: "sum(passes_total) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    limitations: "Volymmått — en balltrygg försvarare med många enkla passningar kan hamna högt utan att skapa något.",
  },
  {
    key: "passesAccuracyPct",
    label: "Passningssäkerhet",
    definition: "Andel lyckade passningar av totalt antal, volymviktat över säsongen.",
    formula: "sum(passes_accuracy) / sum(passes_total) * 100 — se rating-aggregates.ts för en dokumenterad API-kvirk (fältet passes_accuracy i fixture_player_stats är ett rått antal, inte redan en procentsats)",
    source: "fixture_player_stats",
    unit: "%",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    limitations: "Ingen skillnad mellan en trygg 5-meterspassning och en riskfylld genombrottspassning.",
  },
  {
    key: "passesKeyPer90",
    label: "Nyckelpassningar",
    definition: "Passningar som direkt ledde till ett skott, per 90 minuter.",
    formula: "sum(passes_key) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    limitations: "Ingen xA — mäter bara att ett skott följde, inte chansens kvalitet.",
  },
  {
    key: "assistsPer90",
    label: "Assist",
    definition: "Målgivande passningar per 90 minuter.",
    formula: "sum(assists) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "passing",
    limitations: "Litet urval för de flesta spelare — ett fåtal assist kan ge stora percentilsvängningar.",
  },
  {
    key: "dribblesAttemptsPer90",
    label: "Dribbelförsök",
    definition: "Antal dribblingsförsök per 90 minuter.",
    formula: "sum(dribbles_attempts) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "dribbling",
    limitations: "Volymmått, ingen kvalitetsbedömning av motståndet.",
  },
  {
    key: "dribblesSuccessPer90",
    label: "Lyckade dribblingar",
    definition: "Lyckade dribblingar per 90 minuter.",
    formula: "sum(dribbles_success) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "dribbling",
    limitations: "—",
  },
  {
    key: "dribblesSuccessPct",
    label: "Lyckad andel",
    definition: "Andel lyckade dribblingar av totalt antal försök.",
    formula: "sum(dribbles_success) / sum(dribbles_attempts) * 100",
    source: "fixture_player_stats",
    unit: "%",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "dribbling",
    limitations: "Kräver minst ett dribbelförsök — spelare helt utan försök saknar värde här.",
  },
  {
    key: "tacklesTotalPer90",
    label: "Tacklingar",
    definition: "Tacklingar per 90 minuter.",
    formula: "sum(tackles_total) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    limitations: "Volymmått — en spelare som ofta blir förbispelad kan ändå tackla mycket.",
  },
  {
    key: "interceptionsPer90",
    label: "Interceptions",
    definition: "Passningsavläsningar per 90 minuter.",
    formula: "sum(tackles_interceptions) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    limitations: "—",
  },
  {
    key: "duelsWonPer90",
    label: "Vunna dueller",
    definition: "Vunna dueller (alla typer) per 90 minuter.",
    formula: "sum(duels_won) / sum(minutes_played) * 90",
    source: "fixture_player_stats",
    unit: "/90",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    limitations: "duels_total/duels_won blandar mark-, luft- och dribblingsdueller — ingen uppdelning finns i källdatan.",
  },
  {
    key: "duelsWonPct",
    label: "Duellandel",
    definition: "Andel vunna dueller av totalt antal.",
    formula: "sum(duels_won) / sum(duels_total) * 100",
    source: "fixture_player_stats",
    unit: "%",
    population: POPULATION,
    percentileMethod: "empirisk_rank",
    minSample: MIN_SAMPLE_NOTE,
    category: "defending",
    limitations: "Samma dueltyp-begränsning som ovan.",
  },
];
