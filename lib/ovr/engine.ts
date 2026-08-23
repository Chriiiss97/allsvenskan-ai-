/**
 * OVR v2 — orkestrering: databas in, färdiga betyg ut.
 * =============================================================================
 * Det här är det ENDA lagret i motorn som pratar med Supabase. config.ts,
 * compute.ts, metrics.ts och position.ts är rena och testbara; all I/O samlas
 * här så att den gränsen aldrig suddas ut.
 *
 * Läsordningen är medvetet "allt en gång, sedan räkna". Att räkna om
 * referensfördelningar per spelare (som den gamla motorn gjorde vid varje
 * sidvisning) är samma dyra jobb om och om igen. Här laddas hela datalagret en
 * gång och alla säsonger räknas ur samma minnesbild.
 */

import {
  FORM_MATCH_COUNT,
  FORM_MIN_MATCHES,
  FORM_MIN_MINUTES_PER_MATCH,
  LEAGUE_COEFFICIENTS,
  PEER_MIN_MINUTES,
  POSITION_WINDOW_MONTHS,
  REFERENCE_POOL_SEASONS,
  SEASON_WEIGHTS,
  leagueUsability,
  type MetricKey,
  type PositionGroup,
} from "./config";
import {
  buildReferenceDistributions,
  computeRatings,
  metricPercentile,
  preparePlayer,
  type ExternalStint,
  type HistorySeason,
  type PlayerRating,
  type UnratedStint,
  type PlayerSeasonInput,
  type ReferenceDistributions,
} from "./compute";
import { accumulateTotals, foreignStintMetrics, toMetricValues, type PlayerMatchRow } from "./metrics";
import { assignPosition, classifyLineup, positionWindowStart, type LineupAppearance } from "./position";

// =============================================================================
// Datatyper för det inlästa datalagret
// =============================================================================

export interface SeasonRef {
  id: number;
  year: number;
}

export interface PlayerRef {
  id: number;
  full_name: string;
  birth_date: string | null;
  position: string | null;
  current_team_id: number | null;
}

export interface CareerStint {
  player_id: number;
  league_external_id: number;
  league_name: string;
  season_year: number;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}

export interface LeagueCoefficient {
  coefficient: number;
  excluded: boolean;
}

export interface OvrDataset {
  seasons: SeasonRef[];
  players: Map<number, PlayerRef>;
  /** fixture_id -> vilken säsong och när matchen spelades. */
  fixtures: Map<number, { seasonId: number; seasonYear: number; kickoffAt: string }>;
  /** Alla matchrader, i kickoff-ordning. */
  matchRows: PlayerMatchRow[];
  lineupAppearances: LineupAppearance[];
  careerStints: CareerStint[];
  leagueCoefficients: Map<number, LeagueCoefficient>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

async function pageAll<T>(
  supabase: SupabaseLike,
  table: string,
  columns: string,
  refine?: (query: SupabaseLike) => SupabaseLike
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (refine) query = refine(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const MATCH_ROW_COLUMNS = [
  "fixture_id", "player_id", "team_id", "minutes_played", "position",
  "goals", "assists", "shots_on_target", "passes_total", "passes_accuracy", "passes_key",
  "tackles_total", "tackles_blocks", "tackles_interceptions",
  "duels_total", "duels_won", "dribbles_attempts", "dribbles_success",
  "fouls_drawn", "fouls_committed", "offsides", "yellow_cards", "red_cards",
  "saves", "goals_conceded", "penalty_saved",
].join(", ");

/**
 * Läser in allt motorn behöver. Ligakoefficienterna hämtas från tabellen
 * league_coefficients — inte från konstanten i config.ts — så att en justering
 * i databasen får effekt utan deploy. Konstanten är seed-data för tabellen och
 * används bara som reserv om tabellen inte finns eller är tom (t.ex. innan
 * migrationen körts).
 */
export async function loadOvrDataset(supabase: SupabaseLike): Promise<OvrDataset> {
  const [seasons, playersRaw, fixturesRaw, lineupsRaw, stintsRaw] = await Promise.all([
    pageAll<SeasonRef>(supabase, "season", "id, year"),
    pageAll<PlayerRef>(supabase, "player", "id, full_name, birth_date, position, current_team_id"),
    pageAll<{ id: number; season_id: number; kickoff_at: string }>(supabase, "fixture", "id, season_id, kickoff_at"),
    pageAll<{ id: number; fixture_id: number }>(supabase, "fixture_lineup", "id, fixture_id"),
    pageAll<CareerStint>(
      supabase,
      "player_career_stint",
      "player_id, league_external_id, league_name, season_year, minutes_played, goals, assists, yellow_cards, red_cards"
    ),
  ]);

  const seasonYearById = new Map(seasons.map((s) => [s.id, s.year]));
  const fixtures = new Map<number, { seasonId: number; seasonYear: number; kickoffAt: string }>();
  for (const f of fixturesRaw) {
    const year = seasonYearById.get(f.season_id);
    if (year === undefined) continue;
    fixtures.set(f.id, { seasonId: f.season_id, seasonYear: year, kickoffAt: f.kickoff_at });
  }

  const matchRows = await pageAll<PlayerMatchRow>(supabase, "fixture_player_stats", MATCH_ROW_COLUMNS);
  matchRows.sort((a, b) => {
    const ka = fixtures.get(a.fixture_id)?.kickoffAt ?? "";
    const kb = fixtures.get(b.fixture_id)?.kickoffAt ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // Laguppställningar: grid finns bara här, och radbredden måste räknas inom
  // en uppställning — därför bär varje rad sitt lineupId hela vägen.
  const fixtureByLineupId = new Map(lineupsRaw.map((l) => [l.id, l.fixture_id]));
  const lineupPlayers = await pageAll<{
    fixture_lineup_id: number;
    player_id: number;
    position: string | null;
    grid: string | null;
    is_starter: boolean;
  }>(supabase, "fixture_lineup_player", "fixture_lineup_id, player_id, position, grid, is_starter", (q) =>
    q.eq("is_starter", true)
  );

  const minutesByFixturePlayer = new Map<string, number>();
  for (const r of matchRows) {
    if (r.player_id === null) continue;
    minutesByFixturePlayer.set(`${r.fixture_id}:${r.player_id}`, r.minutes_played ?? 0);
  }

  const lineupAppearances: LineupAppearance[] = [];
  for (const lp of lineupPlayers) {
    const fixtureId = fixtureByLineupId.get(lp.fixture_lineup_id);
    if (fixtureId === undefined) continue;
    const fixture = fixtures.get(fixtureId);
    if (!fixture) continue;
    lineupAppearances.push({
      lineupId: lp.fixture_lineup_id,
      playerId: lp.player_id,
      position: lp.position,
      grid: lp.grid,
      minutes: minutesByFixturePlayer.get(`${fixtureId}:${lp.player_id}`) ?? 0,
      kickoffAt: fixture.kickoffAt,
    });
  }

  const leagueCoefficients = await loadLeagueCoefficients(supabase);

  return {
    seasons: seasons.sort((a, b) => a.year - b.year),
    players: new Map(playersRaw.map((p) => [p.id, p])),
    fixtures,
    matchRows,
    lineupAppearances,
    careerStints: stintsRaw,
    leagueCoefficients,
  };
}

async function loadLeagueCoefficients(supabase: SupabaseLike): Promise<Map<number, LeagueCoefficient>> {
  const map = new Map<number, LeagueCoefficient>();
  try {
    const rows = await pageAll<{ league_external_id: number; coefficient: number; excluded: boolean }>(
      supabase,
      "league_coefficients",
      "league_external_id, coefficient, excluded"
    );
    for (const r of rows) {
      map.set(r.league_external_id, { coefficient: Number(r.coefficient), excluded: r.excluded });
    }
  } catch {
    // Tabellen finns inte än (migrationen inte körd). Faller tillbaka på
    // seed-värdena i config.ts hellre än att krascha — samma "fail open"-
    // princip som resten av projektet.
  }
  // Tabellen tom eller saknas (migrationen inte körd): config.ts:s seed-värden
  // gäller. Uteslutningar behöver inte seedas hit — de avgörs av ligaregistret
  // i leagueUsability, inte av den här tabellen.
  if (map.size === 0) {
    for (const seed of LEAGUE_COEFFICIENTS) {
      map.set(seed.league_external_id, { coefficient: seed.coefficient, excluded: false });
    }
  }
  return map;
}

// =============================================================================
// Härledda per-säsongsvyer
// =============================================================================

interface SeasonPlayerSlice {
  playerId: number;
  clubId: number | null;
  minutes: number;
  isGoalkeeper: boolean;
  metrics: Partial<Record<MetricKey, number | null>>;
  rows: PlayerMatchRow[];
}

interface SeasonSlice {
  season: SeasonRef;
  players: Map<number, SeasonPlayerSlice>;
  /** Positionsgrupp per spelare, bestämd av starter i 12-månadersfönstret. */
  positions: Map<number, ReturnType<typeof assignPosition>>;
  distributions: ReferenceDistributions;
}

/**
 * Bygger en säsongsvy: aggregerade mätvärden, positionsgrupper och
 * referensfördelningar.
 *
 * Referensfördelningen poolar REFERENCE_POOL_SEASONS säsonger. Motiv: GK-
 * gruppen är bara 20–29 spelare per säsong, där ett rangsteg är 3,4–5,0
 * percentilenheter — 2–4 OVR mellan två grannar. Rangordningen inom den
 * aktuella säsongen påverkas inte av poolningen; bara upplösningen blir finare.
 */
function buildSeasonSlice(dataset: OvrDataset, season: SeasonRef): SeasonSlice {
  const rowsByPlayer = new Map<number, PlayerMatchRow[]>();
  const clubByPlayer = new Map<number, number>();

  for (const row of dataset.matchRows) {
    const fixture = dataset.fixtures.get(row.fixture_id);
    if (!fixture || fixture.seasonId !== season.id) continue;
    if (row.player_id === null || row.player_id === undefined) continue;
    if ((row.minutes_played ?? 0) <= 0) continue;
    const list = rowsByPlayer.get(row.player_id) ?? [];
    list.push(row);
    rowsByPlayer.set(row.player_id, list);
    // matchRows är kickoff-sorterade, så sista skrivningen vinner: klubben
    // spelaren senast representerade den säsongen. En spelare som bytte klubb
    // i sommarfönstret hamnar alltså på sin nya klubb, vilket är vad en
    // säsongslista ska visa.
    clubByPlayer.set(row.player_id, row.team_id);
  }

  // Positionsbestämning: starter under de senaste POSITION_WINDOW_MONTHS,
  // räknat bakåt från säsongens sista match (inte från "nu" — annars hade en
  // omräkning av 2019 använt 2026 års fönster och gett tomt resultat).
  const seasonEnd = seasonEndDate(dataset, season);
  const windowStart = positionWindowStart(seasonEnd, POSITION_WINDOW_MONTHS);

  const appearancesByLineup = new Map<number, LineupAppearance[]>();
  for (const a of dataset.lineupAppearances) {
    const at = new Date(a.kickoffAt);
    if (at < windowStart || at > seasonEnd) continue;
    const list = appearancesByLineup.get(a.lineupId) ?? [];
    list.push(a);
    appearancesByLineup.set(a.lineupId, list);
  }

  const startsByPlayer = new Map<number, { group: PositionGroup; minutes: number }[]>();
  for (const appearances of appearancesByLineup.values()) {
    const classified = classifyLineup(appearances);
    for (const a of appearances) {
      const group = classified.get(a.playerId);
      if (!group) continue;
      const list = startsByPlayer.get(a.playerId) ?? [];
      list.push({ group, minutes: a.minutes });
      startsByPlayer.set(a.playerId, list);
    }
  }

  const positions = new Map<number, ReturnType<typeof assignPosition>>();
  const players = new Map<number, SeasonPlayerSlice>();

  for (const [playerId, rows] of rowsByPlayer) {
    const assignment = assignPosition(
      startsByPlayer.get(playerId) ?? [],
      dataset.players.get(playerId)?.position ?? null
    );
    positions.set(playerId, assignment);

    const isGoalkeeper = assignment.primary === "GK";
    const totals = accumulateTotals(rows, season.year);
    players.set(playerId, {
      playerId,
      clubId: clubByPlayer.get(playerId) ?? null,
      minutes: totals.minutes,
      isGoalkeeper,
      metrics: toMetricValues(totals, season.year, isGoalkeeper),
      rows,
    });
  }

  return { season, players, positions, distributions: {} };
}

function seasonEndDate(dataset: OvrDataset, season: SeasonRef): Date {
  let latest = 0;
  for (const f of dataset.fixtures.values()) {
    if (f.seasonId !== season.id) continue;
    const t = new Date(f.kickoffAt).getTime();
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest > 0 ? new Date(latest) : new Date(Date.UTC(season.year, 11, 31));
}

/**
 * Referensfördelning för en säsong, poolad över REFERENCE_POOL_SEASONS.
 * Bara spelare över PEER_MIN_MINUTES ingår — en spelare med 90 minuter får ett
 * betyg, men ska inte vara med och definiera skalan.
 */
function buildDistributionsFor(slices: Map<number, SeasonSlice>, seasonYear: number): ReferenceDistributions {
  const peers: { positionGroup: PositionGroup; metrics: Partial<Record<MetricKey, number | null>> }[] = [];
  for (let back = 0; back < REFERENCE_POOL_SEASONS; back++) {
    const slice = slices.get(seasonYear - back);
    if (!slice) continue;
    for (const p of slice.players.values()) {
      if (p.minutes < PEER_MIN_MINUTES) continue;
      const group = slice.positions.get(p.playerId)?.primary;
      if (!group) continue;
      peers.push({ positionGroup: group, metrics: p.metrics });
    }
  }
  return buildReferenceDistributions(peers);
}

// =============================================================================
// Historik
// =============================================================================

/**
 * Sejourer utanför Allsvenskan under DEN SÄSONG SOM BETYGSÄTTS.
 *
 * De räknas som observerat underlag, inte som historik: en spelare som gjorde
 * halva året i MLS och andra halvan i Allsvenskan har spelat fotboll hela
 * året, och betyget ska bygga på allt fram till bedömningstillfället.
 *
 * Viktningen sker på minuter i blendObservedPercentile — samma säsong ger
 * ingen egen bonus, bara den speltid sejouren är värd. Ligakoefficienten
 * översätter prestationen till allsvensk nivå precis som i prior.
 */
function currentSeasonExternal(
  playerId: number,
  seasonYear: number,
  dataset: OvrDataset
): { usable: ExternalStint[]; unrated: UnratedStint[] } {
  const usable: ExternalStint[] = [];
  const unrated: UnratedStint[] = [];

  for (const stint of dataset.careerStints) {
    if (stint.player_id !== playerId || stint.season_year !== seasonYear) continue;
    const minutes = stint.minutes_played ?? 0;
    if (minutes <= 0) continue;

    const usability = resolveUsability(stint.league_external_id, dataset);
    if (!usability.usable || usability.coefficient === null) {
      unrated.push({
        leagueExternalId: stint.league_external_id,
        leagueName: stint.league_name,
        seasonYear: stint.season_year,
        minutes,
        reason: usability.reason,
      });
      continue;
    }

    const per90 = foreignStintMetrics(stint);
    if (Object.keys(per90).length === 0) continue;

    usable.push({
      leagueExternalId: stint.league_external_id,
      leagueName: stint.league_name,
      leagueCoefficient: usability.coefficient,
      minutes,
      per90,
    });
  }
  return { usable, unrated };
}

/**
 * Ligans användbarhet: registret och config avgör formen, databastabellen
 * league_coefficients får justera SIFFRAN. En liga som registret klassar som
 * cup eller träningsmatch blir aldrig användbar, hur tabellen än ser ut —
 * annars kunde en felaktig rad i databasen släppa in Svenska Cupen i betygen.
 */
function resolveUsability(
  leagueExternalId: number,
  dataset: OvrDataset
): { usable: boolean; coefficient: number | null; reason: UnratedStint["reason"] } {
  const base = leagueUsability(leagueExternalId);
  if (!base.usable) return { ...base, reason: base.reason as UnratedStint["reason"] };
  const override = dataset.leagueCoefficients.get(leagueExternalId);
  if (override?.excluded) return { usable: false, coefficient: null, reason: "no_coefficient" as const };
  return { usable: true, coefficient: override?.coefficient ?? base.coefficient, reason: "no_coefficient" };
}

/**
 * Bygger historikunderlaget för en spelare: tidigare allsvenska säsonger
 * (fulla mätvärden) plus utländska stints (bara mål/assist/kort — se
 * metrics.ts:foreignStintMetrics).
 *
 * De allsvenska säsongerna percentileras mot SPELARENS NUVARANDE
 * positionsgrupp, inte mot den grupp han tillhörde då. Skälet är att prior
 * ska vara jämförbar med det observerade den bedöms ihop med: en ytterback som
 * gjorts om till mittback ska få sin historik läst som "så här bra var de här
 * siffrorna för en mittback", annars jämförs två olika måttstockar.
 */
function buildHistory(
  playerId: number,
  ratingSeasonYear: number,
  currentGroup: PositionGroup,
  slices: Map<number, SeasonSlice>,
  dataset: OvrDataset
): { history: HistorySeason[]; unrated: UnratedStint[] } {
  const history: HistorySeason[] = [];
  const unrated: UnratedStint[] = [];

  for (let back = 1; back <= SEASON_WEIGHTS.length; back++) {
    const year = ratingSeasonYear - back;
    const slice = slices.get(year);
    if (!slice) continue;
    const slot = slice.players.get(playerId);
    if (!slot || slot.minutes <= 0) continue;

    const distributions = slice.distributions;
    const percentiles: Partial<Record<MetricKey, number | null>> = {};
    for (const [key, value] of Object.entries(slot.metrics) as [MetricKey, number | null][]) {
      percentiles[key] = metricPercentile(distributions, currentGroup, key, value);
    }
    history.push({
      seasonYear: year,
      minutes: slot.minutes,
      source: "allsvenskan",
      leagueCoefficient: 1,
      leagueName: "Allsvenskan",
      clubId: slot.clubId,
      percentiles,
    });
  }

  for (const stint of dataset.careerStints) {
    if (stint.player_id !== playerId) continue;
    const back = ratingSeasonYear - stint.season_year;
    if (back < 1 || back > SEASON_WEIGHTS.length) continue;

    const usability = resolveUsability(stint.league_external_id, dataset);
    if (!usability.usable || usability.coefficient === null) {
      // Cuper, träningsmatcher och serier utan verifierad koefficient bidrar
      // inte till prior. De redovisas i stället som kända men ovärderbara —
      // hellre en synlig lucka än en påhittad siffra.
      if ((stint.minutes_played ?? 0) > 0) {
        unrated.push({
          leagueExternalId: stint.league_external_id,
          leagueName: stint.league_name,
          seasonYear: stint.season_year,
          minutes: stint.minutes_played ?? 0,
          reason: usability.reason,
        });
      }
      continue;
    }

    const rawPer90 = foreignStintMetrics(stint);
    if (Object.keys(rawPer90).length === 0) continue;

    history.push({
      seasonYear: stint.season_year,
      minutes: stint.minutes_played ?? 0,
      source: "foreign",
      leagueCoefficient: usability.coefficient,
      leagueName: stint.league_name,
      rawPer90,
    });
  }

  return { history, unrated };
}

// =============================================================================
// Form och klubbdatum
// =============================================================================

/**
 * Form räknas på de senaste matcherna I NUVARANDE KLUBB (specens 4.4). En
 * spelare som gjorde 8 mål på våren i en klubb och 1 på hösten i en annan ska
 * inte få vårformen tillskriven sin nya klubb.
 */
function recentFormMetrics(
  slot: SeasonPlayerSlice,
  seasonYear: number,
  dataset: OvrDataset
): { metrics: Partial<Record<MetricKey, number | null>> | null; joinedClubDate: string | null } {
  if (slot.clubId === null) return { metrics: null, joinedClubDate: null };

  const clubRows = slot.rows.filter((r) => r.team_id === slot.clubId);
  if (clubRows.length === 0) return { metrics: null, joinedClubDate: null };

  const joinedClubDate = dataset.fixtures.get(clubRows[0].fixture_id)?.kickoffAt ?? null;

  const eligible = clubRows.filter((r) => (r.minutes_played ?? 0) >= FORM_MIN_MINUTES_PER_MATCH);
  // Under FORM_MIN_MATCHES är "form" bara en enskild match. Att presentera det
  // som en trend vore att låtsas veta något vi inte vet — hellre inget värde.
  if (eligible.length < FORM_MIN_MATCHES) return { metrics: null, joinedClubDate };

  const recent = eligible.slice(-FORM_MATCH_COUNT);
  const totals = accumulateTotals(recent, seasonYear);
  return { metrics: toMetricValues(totals, seasonYear, slot.isGoalkeeper), joinedClubDate };
}

// =============================================================================
// Huvudingång
// =============================================================================

export interface SeasonRatingResult {
  season: SeasonRef;
  ratings: PlayerRating[];
}

/**
 * Räknar fram OVR för en eller flera säsonger ur ett redan inläst datalager.
 *
 * Idempotent och deterministisk: samma dataset in ger exakt samma betyg ut.
 * calculatedAt är enda undantaget och skickas in utifrån, så att inte ens
 * tidsstämpeln smyger in en icke-determinism i beräkningen.
 */
export function computeSeasonRatings(
  dataset: OvrDataset,
  targetSeasonYears: readonly number[],
  calculatedAt: string
): SeasonRatingResult[] {
  // Alla säsonger som behövs: målsäsongerna, deras referenspool och deras
  // historikfönster.
  const needed = new Set<number>();
  for (const year of targetSeasonYears) {
    for (let back = 0; back <= Math.max(REFERENCE_POOL_SEASONS - 1, SEASON_WEIGHTS.length); back++) {
      needed.add(year - back);
    }
  }

  const slices = new Map<number, SeasonSlice>();
  for (const season of dataset.seasons) {
    if (!needed.has(season.year)) continue;
    slices.set(season.year, buildSeasonSlice(dataset, season));
  }
  for (const [year, slice] of slices) {
    slice.distributions = buildDistributionsFor(slices, year);
  }

  const results: SeasonRatingResult[] = [];

  for (const year of targetSeasonYears) {
    const slice = slices.get(year);
    if (!slice) continue;

    const referenceDate = seasonEndDate(dataset, slice.season);
    const inputs: PlayerSeasonInput[] = [];

    for (const slot of slice.players.values()) {
      const assignment = slice.positions.get(slot.playerId);
      if (!assignment) continue;

      const { metrics: formMetrics, joinedClubDate } = recentFormMetrics(slot, year, dataset);
      const external = currentSeasonExternal(slot.playerId, year, dataset);
      const past = buildHistory(slot.playerId, year, assignment.primary, slices, dataset);

      inputs.push({
        playerId: slot.playerId,
        seasonYear: year,
        clubId: slot.clubId,
        minutes: slot.minutes,
        birthDate: dataset.players.get(slot.playerId)?.birth_date ?? null,
        positionGroup: assignment.primary,
        secondaryPositionGroup: assignment.secondary,
        positionConfidence: assignment.confidence,
        metrics: slot.metrics,
        currentSeasonExternal: external.usable,
        unratedStints: [...external.unrated, ...past.unrated],
        history: past.history,
        recentFormMetrics: formMetrics,
        joinedClubDate,
      });
    }

    const prepared = inputs.map((input) =>
      preparePlayer(input, slice.distributions, PEER_MIN_MINUTES, referenceDate)
    );
    results.push({ season: slice.season, ratings: computeRatings(prepared, calculatedAt) });
  }

  return results;
}
