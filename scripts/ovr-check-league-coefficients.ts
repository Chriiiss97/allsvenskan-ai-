/**
 * Mäter ligornas inbördes svårighetsordning empiriskt och jämför mot de
 * koefficienter vi faktiskt använder.
 *
 * Läser bara. Skriver aldrig — se lib/ovr/calibration.ts för varför magnituden
 * inte går att belägga med nuvarande data, och vad som skulle krävas.
 *
 *   npx tsx scripts/ovr-check-league-coefficients.ts
 */

import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { createAdminClient } from "./import/admin-client";
import { lookupLeague } from "../lib/ovr/league-registry";
import { LEAGUE_COEFFICIENTS } from "../lib/ovr/config";
import { ageAt } from "../lib/ovr/compute";
import {
  estimateAll,
  findOrderingConflicts,
  MAX_YEAR_GAP,
  MIN_AGE,
  MIN_MINUTES_PER_SIDE,
  type RatingTransition,
} from "../lib/ovr/calibration";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function pageAll<T>(db: Db, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main(): Promise<void> {
  const db = createAdminClient() as Db;

  const [stints, statistics, seasons, players] = await Promise.all([
    pageAll<{ player_id: number; league_external_id: number; season_year: number; minutes_played: number | null; rating: number | null }>(
      db,
      "player_career_stint",
      "player_id, league_external_id, season_year, minutes_played, rating"
    ),
    pageAll<{ player_id: number; season_id: number; minutes_played: number | null; rating: number | null }>(
      db,
      "statistics",
      "player_id, season_id, minutes_played, rating"
    ),
    pageAll<{ id: number; year: number }>(db, "season", "id, year"),
    pageAll<{ id: number; birth_date: string | null }>(db, "player", "id, birth_date"),
  ]);

  const yearById = new Map(seasons.map((s) => [s.id, s.year]));
  const birthById = new Map(players.map((p) => [p.id, p.birth_date]));

  const domestic = new Map<string, number>();
  for (const r of statistics) {
    if (r.rating === null || (r.minutes_played ?? 0) < MIN_MINUTES_PER_SIDE) continue;
    domestic.set(`${r.player_id}:${yearById.get(r.season_id)}`, Number(r.rating));
  }

  const transitions: RatingTransition[] = [];
  for (const s of stints) {
    if (s.rating === null || (s.minutes_played ?? 0) < MIN_MINUTES_PER_SIDE) continue;
    const registry = lookupLeague(s.league_external_id);
    if (!registry || registry.kind !== "league") continue;

    const birth = birthById.get(s.player_id) ?? null;
    const ageForeign = ageAt(birth, new Date(Date.UTC(s.season_year, 6, 1)));
    if (ageForeign === null || ageForeign < MIN_AGE) continue;

    // Närmaste allsvenska säsong inom fönstret.
    let best: { year: number; rating: number } | null = null;
    for (let gap = 1; gap <= MAX_YEAR_GAP; gap++) {
      for (const year of [s.season_year + gap, s.season_year - gap]) {
        const rating = domestic.get(`${s.player_id}:${year}`);
        if (rating === undefined) continue;
        const ageDomestic = ageAt(birth, new Date(Date.UTC(year, 6, 1)));
        if (ageDomestic === null || ageDomestic < MIN_AGE) continue;
        if (!best) best = { year, rating };
      }
      if (best) break;
    }
    if (!best) continue;

    transitions.push({
      playerId: s.player_id,
      leagueExternalId: s.league_external_id,
      foreignRating: Number(s.rating),
      domesticRating: best.rating,
      movedToAllsvenskan: best.year > s.season_year,
      foreignYear: s.season_year,
      domesticYear: best.year,
    });
  }

  console.log(
    `${transitions.length} spelarövergångar med betyg på båda sidor ` +
      `(minst ${MIN_MINUTES_PER_SIDE} min, ålder minst ${MIN_AGE}, max ${MAX_YEAR_GAP} års lucka)\n`
  );

  const estimates = estimateAll(transitions);
  const coefficients = new Map(LEAGUE_COEFFICIENTS.map((l) => [l.league_external_id, l.coefficient]));

  console.log("UPPMÄTT SVÅRIGHETSORDNING — positiv skillnad = svårare än Allsvenskan");
  console.log("Enheten är api-footballs betygsskala, INTE en koefficient. Se lib/ovr/calibration.ts.\n");
  console.log("liga                            land            spelare  Δbetyg    in     ut   koef idag");
  for (const e of estimates.filter((x) => x.reliable)) {
    const reg = lookupLeague(e.leagueExternalId);
    const coef = coefficients.get(e.leagueExternalId);
    const sign = (v: number | null) => (v === null ? "    —" : ((v >= 0 ? "+" : "") + v.toFixed(2)).padStart(5));
    console.log(
      `${(reg?.name ?? "?").slice(0, 30).padEnd(30)}  ${(reg?.country ?? "").slice(0, 13).padEnd(13)}  ${String(e.players).padStart(5)}   ` +
        `${sign(e.medianRatingDelta)}  ${sign(e.deltaFromIncoming)}  ${sign(e.deltaFromOutgoing)}   ` +
        `${coef === undefined ? "SAKNAS" : coef.toFixed(2)}`
    );
  }

  const unreliable = estimates.filter((x) => !x.reliable);
  console.log(`\n${unreliable.length} ligor har för tunt eller motsägelsefullt underlag:`);
  for (const e of unreliable.filter((x) => x.players >= 5).slice(0, 10)) {
    const reg = lookupLeague(e.leagueExternalId);
    console.log(`  ${(reg?.name ?? "?").slice(0, 30).padEnd(30)} ${e.unreliableReason}`);
  }

  const conflicts = findOrderingConflicts(estimates, coefficients);
  console.log(`\n${"=".repeat(78)}`);
  console.log("KONFLIKTER — mätningen och koefficienterna är oense om ordningen");
  console.log("=".repeat(78));
  if (conflicts.length === 0) {
    console.log("Inga. Koefficienternas inbördes ordning stämmer med det vi kan mäta.");
  }
  for (const c of conflicts) {
    const harder = lookupLeague(c.harderByMeasurement);
    const easier = lookupLeague(c.easierByMeasurement);
    // Land måste med: tre olika ligor i datan heter "1. Division" (Danmark,
    // Norge, Cypern), och utan land går konflikten inte att agera på.
    const label = (l: ReturnType<typeof lookupLeague>) => `${l?.name ?? "?"} (${l?.country ?? "?"})`;
    console.log(
      `  ${label(harder).slice(0, 34).padEnd(34)} koef ${c.coefficientOfHarder.toFixed(2)}  mäts SVÅRARE än  ` +
        `${label(easier).slice(0, 34).padEnd(34)} koef ${c.coefficientOfEasier.toFixed(2)}   (${c.measuredGap.toFixed(2)} betyg)`
    );
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log("Inga koefficienter har ändrats. calibrated är fortfarande false för samtliga.");
  console.log("Se lib/ovr/calibration.ts för varför magnituden inte går att belägga än.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
