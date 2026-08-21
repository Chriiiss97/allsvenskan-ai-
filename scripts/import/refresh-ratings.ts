import { createAdminClient } from "./admin-client";
import { computeSeasonRatings } from "../../lib/football/rating/compute-rating";
import { computeSeasonGoalkeeperRatings } from "../../lib/football/rating/goalkeeper-rating";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Facit-skrivaren till player_season_rating (se migration
 * 20260821120000_player_season_rating.sql) — INTE ny beräkningslogik.
 * Återanvänder computeSeasonRatings/computeSeasonGoalkeeperRatings rakt av
 * (samma redan hand-verifierade funktioner Scout/Topplistan/profilsidan
 * använder) och skriver bara resultatet till en tabell istället för att
 * bara returnera det till en enskild sidladdning.
 *
 * Två anropssätt:
 * - refreshRatingsForSeason: EN säsong, snabbt (~5-10s) — det som ska köras
 *   efter varje dags avslutade matcher (kopplas in i finalize-cronen).
 *   Historiska säsonger ändras aldrig efter att de är facitställda, så bara
 *   DEN AKTUELLA säsongen behöver periodisk uppdatering.
 * - refreshAllSeasonRatings: ALLA säsonger, en engångs-backfill (körs
 *   manuellt lokalt via `npm run import ratings`, inte tidsbegränsad av en
 *   serverless-timeout som cronen är).
 */
export async function refreshRatingsForSeason(supabase: Supabase, params: { seasonId: number; seasonYear: number }): Promise<number> {
  const [outfield, goalkeepers] = await Promise.all([
    computeSeasonRatings(supabase, { season: params.seasonYear }),
    computeSeasonGoalkeeperRatings(supabase, { season: params.seasonYear }),
  ]);

  type UpsertRow = {
    player_id: number;
    season_id: number;
    position_group: "goalkeeper" | "defender" | "midfielder" | "attacker";
    ovr: number | null;
    confidence_tier: "hög" | "medel" | "låg" | null;
    own_minutes: number;
    computed_at: string;
  };
  const now = new Date().toISOString();
  const rows: UpsertRow[] = [];

  for (const [playerId, r] of outfield) {
    if (!r.available || !r.positionGroup) continue; // t.ex. okänd position — inget rimligt facit att skriva
    rows.push({
      player_id: playerId,
      season_id: params.seasonId,
      position_group: r.positionGroup,
      ovr: r.ovr,
      confidence_tier: r.confidence?.tier ?? null,
      own_minutes: r.confidence?.ownMinutes ?? 0,
      computed_at: now,
    });
  }
  for (const [playerId, r] of goalkeepers) {
    if (!r.available) continue;
    rows.push({
      player_id: playerId,
      season_id: params.seasonId,
      position_group: "goalkeeper",
      ovr: r.ovr,
      confidence_tier: r.confidence?.tier ?? null,
      own_minutes: r.confidence?.ownMinutes ?? 0,
      computed_at: now,
    });
  }

  // Batchad upsert — samma "inte en fråga per rad"-disciplin som resten av
  // importlagret (t.ex. finalize-match.ts:s event-chunkning).
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("player_season_rating").upsert(chunk, { onConflict: "player_id,season_id" });
    if (error) throw error;
    written += chunk.length;
  }
  return written;
}

export async function refreshAllSeasonRatings(supabase: Supabase = createAdminClient()): Promise<void> {
  const { data: seasons, error } = await supabase.from("season").select("id, year").order("year", { ascending: false });
  if (error) throw error;

  for (const s of seasons ?? []) {
    console.log(`Räknar rating för säsong ${s.year}...`);
    const written = await refreshRatingsForSeason(supabase, { seasonId: s.id, seasonYear: s.year });
    console.log(`  ${written} spelarrader skrivna för ${s.year}.`);
  }
}
