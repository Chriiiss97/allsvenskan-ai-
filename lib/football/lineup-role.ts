import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * DERIVED-lager (steg 8): rolldata härledd ur `fixture_lineup_player` —
 * grid-positionen ("2:1"–"2:4" osv, riktig sub-positionsdata inom en
 * formation) och laguppställningens formation är unika för den här tabellen,
 * inte tillgängliga någon annanstans. Ren beräkning på redan sparad data.
 *
 * OBS namngivning: `is_starter`/`grid` kommer från MATCHDAGSTRUPPEN
 * (/fixtures/lineups) — den säger vem som VAR UTTAGEN som startelva vs
 * avbytare, inte vem som FAKTISKT KOM IN under matchen (det äkta
 * in-hopp-flagget är `fixture_player_stats.games.substitute`, en annan
 * tabell, inte importerad hit). `substituteListings` nedan betyder alltså
 * "listad som avbytare i truppen", inte "hoppade in".
 */

interface LineupPlayerRow {
  is_starter: boolean;
  position: string | null;
  fixture_lineup: { formation: string | null; fixture: { season_id: number } | null } | null;
}

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export interface PlayerLineupRoleProfile {
  /** Antal matcher spelaren var uttagen i startelvan den här säsongen. */
  starts: number;
  /** Antal matcher spelaren var listad som avbytare (INTE nödvändigtvis kom in — se filbeskrivningen). */
  substituteListings: number;
  /** Vanligaste positionsbokstaven (G/D/M/F) i laguppställningarna. */
  mostCommonPosition: string | null;
  /** Vanligaste lagformationen i de matcher spelaren var uttagen till. */
  mostCommonFormation: string | null;
}

export async function getPlayerLineupRoleProfile(
  supabase: Supabase,
  params: { playerId: number; seasonId: number }
): Promise<PlayerLineupRoleProfile | null> {
  const { data: rows, error } = await supabase
    .from("fixture_lineup_player")
    .select("is_starter, position, fixture_lineup:fixture_lineup_id(formation, fixture:fixture_id(season_id))")
    .eq("player_id", params.playerId)
    .returns<LineupPlayerRow[]>();
  if (error) throw error;

  const seasonRows = (rows ?? []).filter((r) => r.fixture_lineup?.fixture?.season_id === params.seasonId);
  if (seasonRows.length === 0) return null;

  return {
    starts: seasonRows.filter((r) => r.is_starter).length,
    substituteListings: seasonRows.filter((r) => !r.is_starter).length,
    mostCommonPosition: mostCommon(seasonRows.map((r) => r.position)),
    mostCommonFormation: mostCommon(seasonRows.map((r) => r.fixture_lineup?.formation ?? null)),
  };
}
