/**
 * OVR v2 — från rå matchstatistik till mätvärden.
 * =============================================================================
 * RENA FUNKTIONER. Tar rader ur fixture_player_stats och producerar de per-90-
 * tal och kvoter som compute.ts percentilerar. All hantering av källdatans
 * kända egenheter bor här, inte utspridd i beräkningslogiken.
 *
 * -----------------------------------------------------------------------------
 * NULL BETYDER NOLL — men bara för räknefält, och det är verifierat
 * -----------------------------------------------------------------------------
 * API-Football utelämnar räknefält i stället för att skicka 0. En rad med
 * shots_on_target = null betyder att spelaren inte sköt på mål, inte att vi
 * saknar uppgiften.
 *
 * Det här är INTE ett antagande. Det är avstämt mot fixture_team_stats, som
 * kommer från en helt annan endpoint: summan av spelarnas skott på mål mot
 * lagets, per säsong 2017–2025, ger kvot 0,994–1,006. Om nullvärden dolde
 * verkliga skott hade summan varit systematiskt för låg. Samma kontroll gjord
 * för passningar (kvot exakt 1,000 från 2021).
 *
 * Undantaget är mått som är HELT frånvarande vissa säsonger — offsides före
 * 2020, passningsprocent 2020. De hanteras via METRICS[...].unavailableSeasons
 * i config.ts och blir null, inte noll.
 */

import { passAccuracyEra, METRICS, type MetricKey } from "./config";

/**
 * En spelares rad i en match. Fältnamnen följer fixture_player_stats exakt så
 * att inget översättningslager kan tappa bort en kolumn på vägen.
 */
export interface PlayerMatchRow {
  fixture_id: number;
  player_id: number;
  team_id: number;
  minutes_played: number | null;
  position: string | null;
  goals: number | null;
  assists: number | null;
  shots_on_target: number | null;
  passes_total: number | null;
  passes_accuracy: number | null;
  passes_key: number | null;
  tackles_total: number | null;
  tackles_blocks: number | null;
  tackles_interceptions: number | null;
  duels_total: number | null;
  duels_won: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  fouls_drawn: number | null;
  fouls_committed: number | null;
  offsides: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  saves: number | null;
  goals_conceded: number | null;
  penalty_saved: number | null;
}

export interface SeasonTotals {
  minutes: number;
  matches: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  passesTotal: number;
  passesAccurate: number;
  /** Minutviktad summa av procentfältet — bara meningsfull i "percentage"-eran. */
  passAccuracyMinuteWeighted: number;
  passAccuracyMinutes: number;
  keyPasses: number;
  tackles: number;
  blocks: number;
  interceptions: number;
  duelsTotal: number;
  duelsWon: number;
  dribbleAttempts: number;
  dribblesCompleted: number;
  foulsDrawn: number;
  foulsCommitted: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  goalsConceded: number;
  penaltySaves: number;
  /** Matcher där målvakten spelade minst CLEAN_SHEET_MIN_MINUTES. */
  goalkeeperMatches: number;
  cleanSheets: number;
}

/**
 * Minsta speltid för att en match ska räknas i hållna nollor. Utan gränsen får
 * en målvakt som byts in i 88:e minuten vid 0-0 en "hållen nolla" på två
 * minuters arbete.
 */
export const CLEAN_SHEET_MIN_MINUTES = 45;

function n(value: number | null | undefined): number {
  return value === null || value === undefined || !Number.isFinite(value) ? 0 : value;
}

export function emptyTotals(): SeasonTotals {
  return {
    minutes: 0, matches: 0, goals: 0, assists: 0, shotsOnTarget: 0,
    passesTotal: 0, passesAccurate: 0, passAccuracyMinuteWeighted: 0, passAccuracyMinutes: 0,
    keyPasses: 0, tackles: 0, blocks: 0, interceptions: 0,
    duelsTotal: 0, duelsWon: 0, dribbleAttempts: 0, dribblesCompleted: 0,
    foulsDrawn: 0, foulsCommitted: 0, offsides: 0, yellowCards: 0, redCards: 0,
    saves: 0, goalsConceded: 0, penaltySaves: 0, goalkeeperMatches: 0, cleanSheets: 0,
  };
}

/**
 * Summerar matchrader till säsongstotaler.
 *
 * seasonYear styr HUR passes_accuracy tolkas — fältet är en procent t.o.m.
 * 2019 och ett antal träffsäkra passningar fr.o.m. 2021 (verifierat mot
 * lagstatistiken, se config.ts datasanning 1). 2020 går inte att reda ut per
 * rad och lämnas därhän.
 */
export function accumulateTotals(rows: readonly PlayerMatchRow[], seasonYear: number): SeasonTotals {
  const totals = emptyTotals();
  const era = passAccuracyEra(seasonYear);

  for (const row of rows) {
    const minutes = n(row.minutes_played);
    if (minutes <= 0) continue;

    totals.minutes += minutes;
    totals.matches += 1;
    totals.goals += n(row.goals);
    totals.assists += n(row.assists);
    totals.shotsOnTarget += n(row.shots_on_target);
    totals.passesTotal += n(row.passes_total);
    totals.keyPasses += n(row.passes_key);
    totals.tackles += n(row.tackles_total);
    totals.blocks += n(row.tackles_blocks);
    totals.interceptions += n(row.tackles_interceptions);
    totals.duelsTotal += n(row.duels_total);
    totals.duelsWon += n(row.duels_won);
    totals.dribbleAttempts += n(row.dribbles_attempts);
    totals.dribblesCompleted += n(row.dribbles_success);
    totals.foulsDrawn += n(row.fouls_drawn);
    totals.foulsCommitted += n(row.fouls_committed);
    totals.offsides += n(row.offsides);
    totals.yellowCards += n(row.yellow_cards);
    totals.redCards += n(row.red_cards);
    totals.saves += n(row.saves);
    totals.goalsConceded += n(row.goals_conceded);
    totals.penaltySaves += n(row.penalty_saved);

    if (era === "accurate_count") {
      totals.passesAccurate += n(row.passes_accuracy);
    } else if (era === "percentage" && row.passes_accuracy !== null && row.passes_accuracy !== undefined) {
      totals.passAccuracyMinuteWeighted += row.passes_accuracy * minutes;
      totals.passAccuracyMinutes += minutes;
    }

    if (row.position === "G" && minutes >= CLEAN_SHEET_MIN_MINUTES) {
      totals.goalkeeperMatches += 1;
      if (n(row.goals_conceded) === 0) totals.cleanSheets += 1;
    }
  }
  return totals;
}

/** Kvot som bara returneras när nämnaren är stor nog att kvoten ska betyda något. */
function ratio(numerator: number, denominator: number, minDenominator: number): number | null {
  if (denominator < minDenominator || denominator <= 0) return null;
  return numerator / denominator;
}

function per90(total: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return (total / minutes) * 90;
}

/**
 * Räknar om säsongstotaler till motorns mätvärden.
 *
 * Mått som är helt frånvarande den säsongen (config: unavailableSeasons)
 * returneras som null, aldrig som 0 — annars hade varenda spelare 2019 fått
 * "bäst i ligan på att undvika offside" av en datalucka.
 */
export function toMetricValues(
  totals: SeasonTotals,
  seasonYear: number,
  isGoalkeeper: boolean
): Partial<Record<MetricKey, number | null>> {
  const m = totals.minutes;
  const out: Partial<Record<MetricKey, number | null>> = {};

  const set = (key: MetricKey, value: number | null) => {
    if (METRICS[key].unavailableSeasons?.includes(seasonYear)) {
      out[key] = null;
      return;
    }
    out[key] = value;
  };

  set("goals_per90", per90(totals.goals, m));
  set("assists_per90", per90(totals.assists, m));
  set("goal_contributions_per90", per90(totals.goals + totals.assists, m));
  set("shots_on_target_per90", per90(totals.shotsOnTarget, m));
  // Mål per skott PÅ MÅL. shots_total byter definition 2020–21 och duger inte
  // som nämnare över tid — se config.ts datasanning 2.
  set("conversion", ratio(totals.goals, totals.shotsOnTarget, METRICS.conversion.minDenominator ?? 5));
  set("key_passes_per90", per90(totals.keyPasses, m));

  const era = passAccuracyEra(seasonYear);
  let passPct: number | null = null;
  if (era === "accurate_count") {
    passPct = ratio(totals.passesAccurate, totals.passesTotal, METRICS.pass_pct.minDenominator ?? 100);
  } else if (era === "percentage" && totals.passAccuracyMinutes > 0) {
    // Fältet ÄR procenten. Minutvikta i stället för att summera, annars
    // dominerar den som spelat flest matcher i stället för den som är bäst.
    passPct = totals.passesTotal >= (METRICS.pass_pct.minDenominator ?? 100)
      ? totals.passAccuracyMinuteWeighted / totals.passAccuracyMinutes / 100
      : null;
  }
  set("pass_pct", passPct);

  set("pass_volume_per90", per90(totals.passesTotal, m));
  set("dribbles_completed_per90", per90(totals.dribblesCompleted, m));
  set("dribble_success_pct", ratio(totals.dribblesCompleted, totals.dribbleAttempts, METRICS.dribble_success_pct.minDenominator ?? 15));
  set("duels_won_pct", ratio(totals.duelsWon, totals.duelsTotal, METRICS.duels_won_pct.minDenominator ?? 40));
  set("tackles_per90", per90(totals.tackles, m));
  set("interceptions_blocks_per90", per90(totals.interceptions + totals.blocks, m));
  set("ball_recoveries_per90", per90(totals.tackles + totals.interceptions, m));
  set("fouls_drawn_per90", per90(totals.foulsDrawn, m));
  // Rött kort väger dubbelt mot gult — en utvisning kostar laget resten av matchen.
  set("cards_per90", per90(totals.yellowCards + 2 * totals.redCards, m));
  set("fouls_committed_per90", per90(totals.foulsCommitted, m));
  set("offsides_per90", per90(totals.offsides, m));

  if (isGoalkeeper) {
    set("save_pct", ratio(totals.saves, totals.saves + totals.goalsConceded, METRICS.save_pct.minDenominator ?? 15));
    set("goals_conceded_per90", per90(totals.goalsConceded, m));
    set("clean_sheet_rate", ratio(totals.cleanSheets, totals.goalkeeperMatches, METRICS.clean_sheet_rate.minDenominator ?? 3));
    set("penalty_saves_per90", per90(totals.penaltySaves, m));
  } else {
    out.save_pct = null;
    out.goals_conceded_per90 = null;
    out.clean_sheet_rate = null;
    out.penalty_saves_per90 = null;
  }

  return out;
}

/**
 * Mätvärden för en utländsk säsong ur player_career_stint.
 *
 * player_career_stint innehåller BARA matcher, startelvor, minuter, mål,
 * assist, kort och api-footballs eget betyg. Inga dueller, passningar,
 * tacklingar, skott eller dribblingar finns för utländska ligor — det är
 * källans gräns, inte ett importfel. Prior från en utländsk säsong kan därför
 * bara omfatta de mått som faktiskt går att räkna, och gör det: resten lämnas
 * orörda i stället för att fyllas med en proxy.
 */
export function foreignStintMetrics(stint: {
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}): Partial<Record<MetricKey, number | null>> {
  const m = n(stint.minutes_played);
  if (m <= 0) return {};
  return {
    goals_per90: per90(n(stint.goals), m),
    assists_per90: per90(n(stint.assists), m),
    goal_contributions_per90: per90(n(stint.goals) + n(stint.assists), m),
    cards_per90: per90(n(stint.yellow_cards) + 2 * n(stint.red_cards), m),
  };
}
