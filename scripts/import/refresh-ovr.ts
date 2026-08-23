/**
 * OVR v2 — batchskrivaren till player_ratings.
 * =============================================================================
 * Idempotent: kör den hur många gånger som helst på samma data och databasen
 * hamnar i exakt samma läge. Upsert på (player_id, season_id), inga
 * append-rader, ingen slump i beräkningen.
 *
 * All beräkning ligger i lib/ovr/. Det här scriptet gör tre saker: läser,
 * anropar motorn, skriver. Ingen betygslogik får smyga in här.
 */

import { createAdminClient } from "./admin-client";
import { CONFIG_VERSION, LEAGUE_COEFFICIENTS } from "../../lib/ovr/config";
import { LEAGUE_REGISTRY } from "../../lib/ovr/league-registry";
import { computeSeasonRatings, loadOvrDataset, type OvrDataset } from "../../lib/ovr/engine";
import type { PlayerRating } from "../../lib/ovr/compute";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Seedar league_coefficients från config.ts.
 *
 * Skriver ALDRIG över en koefficient som någon redan markerat som calibrated —
 * hela poängen med tabellen är att den ska gå att justera utan deploy, och en
 * omkörning av seeden får inte kasta bort det arbetet.
 */
export async function seedLeagueCoefficients(supabase: Supabase = createAdminClient()): Promise<number> {
  const { data: existing, error: readError } = await (supabase as never as {
    from: (t: string) => {
      select: (c: string) => Promise<{
        data: { league_external_id: number; calibrated: boolean }[] | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from("league_coefficients")
    .select("league_external_id, calibrated");
  if (readError) throw new Error(`league_coefficients: ${readError.message}`);
  const calibrated = new Set((existing ?? []).filter((row) => row.calibrated).map((row) => row.league_external_id));

  type Row = {
    league_external_id: number;
    league_name: string;
    country: string | null;
    coefficient: number;
    calibrated: boolean;
    excluded: boolean;
    note: string | null;
  };

  const rows: Row[] = LEAGUE_COEFFICIENTS.filter((l) => !calibrated.has(l.league_external_id)).map((l) => ({
    league_external_id: l.league_external_id,
    league_name: l.league_name,
    country: l.country,
    coefficient: l.coefficient,
    calibrated: false,
    excluded: false,
    note: l.note ?? null,
  }));

  // Allt annat som förekommer i datan skrivs också in — som EXCLUDED och utan
  // en påhittad koefficient. Poängen är att luckan ska vara synlig i databasen:
  // "de här 44 518 minuterna i League One kan vi inte värdera än" går att
  // fråga efter, prioritera och åtgärda. En tyst standardkoefficient gick inte.
  const known = new Set(LEAGUE_COEFFICIENTS.map((l) => l.league_external_id));
  for (const entry of LEAGUE_REGISTRY) {
    if (known.has(entry.id) || calibrated.has(entry.id)) continue;
    const note =
      entry.kind === "league"
        ? "Seriespel utan verifierad koefficient — utesluts ur betyget tills den kalibrerats."
        : `${entry.kind} — blandar divisioner eller är inte tävlingsspel, ingår aldrig i ett betyg.`;
    rows.push({
      league_external_id: entry.id,
      league_name: entry.name,
      country: entry.country,
      // Kolumnen är NOT NULL med check > 0. 1.00 här betyder INTE "likvärdig
      // med Allsvenskan" — raden är excluded, så siffran används aldrig.
      coefficient: 1,
      calibrated: false,
      excluded: true,
      note,
    });
  }

  if (rows.length === 0) return 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("league_coefficients" as never)
      .upsert(rows.slice(i, i + CHUNK) as never, { onConflict: "league_external_id" });
    if (error) throw new Error(`league_coefficients: ${error.message}`);
  }
  return rows.length;
}

function toRow(rating: PlayerRating, seasonId: number) {
  return {
    player_id: rating.player_id,
    season_id: seasonId,
    season_year: rating.season,
    club_id: rating.club_id,
    position_group: rating.position_group,
    secondary_position_group: rating.secondary_position_group,
    position_confidence: rating.position_confidence,
    ovr: rating.ovr,
    current_season_rating: rating.current_season_rating,
    historical_rating: rating.historical_rating,
    potential: rating.potential,
    form: rating.form,
    confidence: rating.confidence,
    confidence_tier: rating.confidence_tier,
    prior_weight: rating.prior_weight,
    minutes_played: rating.minutes_played,
    external_minutes: rating.external_minutes,
    unrated_minutes: rating.unrated_minutes,
    subscore_finishing: rating.subscores.finishing,
    subscore_passing: rating.subscores.passing,
    subscore_dribbling: rating.subscores.dribbling,
    subscore_defending: rating.subscores.defending,
    subscore_duels: rating.subscores.duels,
    subscore_goalkeeping: rating.subscores.goalkeeping,
    historical_evidence: rating.historical_evidence,
    config_version: rating.config_version,
    calculated_at: rating.calculated_at,
  };
}

export interface RefreshResult {
  seasonYear: number;
  written: number;
}

/**
 * Räknar om och skriver OVR för de angivna säsongerna. Utan argument: alla
 * säsonger som finns i databasen.
 *
 * Datalagret läses EN gång även när flera säsonger räknas om — referens-
 * fördelningar och historik delas mellan säsongerna, och att läsa om 80 000
 * matchrader per säsong vore rent slöseri.
 */
export async function refreshOvr(
  supabase: Supabase = createAdminClient(),
  options: { seasonYears?: number[]; dataset?: OvrDataset; log?: (message: string) => void } = {}
): Promise<RefreshResult[]> {
  const log = options.log ?? ((m: string) => console.log(m));

  log("Läser in datalagret...");
  const dataset = options.dataset ?? (await loadOvrDataset(supabase));
  log(
    `  ${dataset.matchRows.length} matchrader, ${dataset.players.size} spelare, ` +
      `${dataset.lineupAppearances.length} starter, ${dataset.careerStints.length} karriärposter.`
  );

  const targetYears = options.seasonYears ?? dataset.seasons.map((s) => s.year);
  const seasonIdByYear = new Map(dataset.seasons.map((s) => [s.year, s.id]));

  // En enda tidsstämpel för hela körningen, så att en omgång betyg går att
  // känna igen som just en omgång.
  const calculatedAt = new Date().toISOString();

  log(`Räknar OVR för ${targetYears.length} säsonger (config ${CONFIG_VERSION})...`);
  const results = computeSeasonRatings(dataset, targetYears, calculatedAt);

  const out: RefreshResult[] = [];
  for (const result of results) {
    const seasonId = seasonIdByYear.get(result.season.year);
    if (seasonId === undefined) continue;

    const rows = result.ratings.map((r) => toRow(r, seasonId));
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from("player_ratings" as never)
        .upsert(rows.slice(i, i + CHUNK) as never, { onConflict: "player_id,season_id" });
      if (error) throw new Error(`player_ratings (${result.season.year}): ${error.message}`);
      written += Math.min(CHUNK, rows.length - i);
    }
    // Städa bort rader som INTE skrevs i den här körningen. Utan det ligger
    // betyg kvar för spelare som inte längre kvalificerar sig — t.ex. någon
    // vars speltid korrigerats bort i en omimport, eller rader från en äldre
    // config-version med en annan urvalsregel. Databasen ska spegla den
    // senaste körningen exakt, inte vara ett lager av gamla körningar.
    //
    // Säkert eftersom alla rader i en körning delar samma calculated_at.
    const { error: staleError, count: staleCount } = await supabase
      .from("player_ratings" as never)
      .delete({ count: "exact" })
      .eq("season_id", seasonId)
      .lt("calculated_at", calculatedAt);
    if (staleError) throw new Error(`player_ratings städning (${result.season.year}): ${staleError.message}`);

    log(
      `  ${result.season.year}: ${written} spelarbetyg skrivna` +
        (staleCount ? `, ${staleCount} inaktuella rader borttagna` : "") +
        "."
    );
    out.push({ seasonYear: result.season.year, written });
  }
  return out;
}

/** Kör bara den senaste säsongen — det enda som ändras efter en spelad omgång. */
export async function refreshCurrentSeasonOvr(supabase: Supabase = createAdminClient()): Promise<RefreshResult[]> {
  const dataset = await loadOvrDataset(supabase);
  const latest = dataset.seasons[dataset.seasons.length - 1];
  if (!latest) return [];
  return refreshOvr(supabase, { seasonYears: [latest.year], dataset });
}

/** Seed + full omräkning. Ingången för `npm run import ovr`. */
export async function refreshAllOvr(supabase: Supabase = createAdminClient()): Promise<void> {
  const seeded = await seedLeagueCoefficients(supabase);
  console.log(`Ligakoefficienter: ${seeded} rader seedade (calibrated-rader lämnade orörda).`);
  await refreshOvr(supabase);
}
