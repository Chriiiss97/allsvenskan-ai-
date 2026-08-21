import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";

const DEFAULT_MAX_FIXTURES_PER_RUN = 700; // marginal over de 664/615 mappade fixturesen

/**
 * Per-spelare avancerad matchstatistik. type_id-mappningen är EXAKT den vi
 * verifierat live över tre matcher (2024/2025/2026) i researchsessionen —
 * cross-validerad, inte gissad. Fält som redan finns i fixture_player_stats
 * (mål/skott/passningar-VOLYM/tacklingar/dueller-antal/dribblingar/fouls/
 * kort/betyg/minuter/räddningar) importeras INTE hit — bara nytt/förbättrat.
 * type_id 58/97 (två nästan identiska "Shots/Blocked"-varianter, oklar
 * semantik) och 116 (Accurate Passes, ett RÅTT ANTAL — sannolikt dubblett
 * av fixture_player_stats.passes_accuracy) och 117172 (Cumulative Minutes
 * Played, ingen dedikerad kolumn ännu) hamnar i raw_types — inte konsumerat
 * av analyskod förrän verifierat, samma spärr som xG:s shooting_performance.
 */
const PLAYER_ADVANCED_TYPE_MAP: Record<number, string> = {
  64: "hit_woodwork",
  94: "dispossessed",
  98: "total_crosses",
  99: "accurate_crosses",
  101: "clearances",
  103: "gk_punches",
  104: "gk_saves_insidebox",
  107: "aerials_won",
  120: "touches",
  121: "turnovers",
  122: "long_balls",
  123: "long_balls_won",
  580: "big_chances_created",
  581: "big_chances_missed",
  582: "clearance_offline",
  584: "gk_good_high_claim",
  1490: "man_of_match",
  1533: "successful_crosses_pct",
  1584: "passes_accuracy_pct",
  5304: "xg",
  5305: "xgot",
  9706: "chances_created",
  27266: "aerials_lost",
  27267: "tackles_won",
  27268: "tackles_won_pct",
  27269: "passes_final_third",
  27270: "long_balls_won_pct",
  27271: "ball_recovery",
  27272: "backward_passes",
  27273: "possession_lost",
  27274: "aerials_total",
  27275: "aerials_won_pct",
  27276: "duels_won_pct",
  48997: "error_lead_to_shot",
};
const BOOLEAN_COLUMNS = new Set(["man_of_match"]);

interface LineupDetail {
  type_id: number;
  data: { value: number | boolean | string };
}
interface LineupEntry {
  player_id: number;
  team_id: number;
  details?: LineupDetail[];
}

export async function importSportmonksPlayerAdvancedStats(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const { data: teams } = await supabase.from("team").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const teamIdBySm = new Map((teams ?? []).map((t) => [t.sportmonks_id!, t.id]));

  const { data: players } = await supabase.from("player").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const playerIdBySm = new Map((players ?? []).map((p) => [p.sportmonks_id!, p.id]));

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, status")
    .not("sportmonks_id", "is", null)
    .is("sportmonks_advanced_stats_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta avancerad spelarstatistik för.");
    return;
  }
  console.log(`Hämtar avancerad spelarstatistik för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  let playersWritten = 0;
  let playersSkippedUnmapped = 0;
  const unknownTypeIds = new Set<number>();

  for (const fixture of fixtures) {
    const { data } = await sportmonksGet<{ lineups?: LineupEntry[] }>(`football/fixtures/${fixture.sportmonks_id}`, {
      include: "lineups.details",
    });
    const lineups = data.lineups ?? [];

    let writtenThisFixture = 0;
    for (const entry of lineups) {
      if (!entry.details || entry.details.length === 0) continue; // spelare utan matchdetaljer (kom inte in)

      const playerId = playerIdBySm.get(entry.player_id);
      if (!playerId) {
        playersSkippedUnmapped++;
        continue; // hård spärr: ingen godkänd Fas 3-mappning -> ingen import (gissa aldrig)
      }
      const teamId = teamIdBySm.get(entry.team_id);
      if (!teamId) continue;

      const row: Record<string, number | boolean> = {};
      const rawTypes: Record<string, number | boolean | string> = {};
      for (const det of entry.details) {
        const column = PLAYER_ADVANCED_TYPE_MAP[det.type_id];
        if (!column) {
          rawTypes[det.type_id] = det.data.value;
          unknownTypeIds.add(det.type_id);
          continue;
        }
        if (BOOLEAN_COLUMNS.has(column)) {
          row[column] = det.data.value === true;
        } else if (typeof det.data.value === "number") {
          row[column] = det.data.value;
        }
      }

      const { error: upsertError } = await supabase.from("fixture_player_advanced_stats").upsert(
        { fixture_id: fixture.id, team_id: teamId, player_id: playerId, ...row, raw_types: rawTypes },
        { onConflict: "fixture_id,player_id" }
      );
      if (upsertError) throw upsertError;
      playersWritten++;
      writtenThisFixture++;
    }

    await supabase.from("fixture").update({ sportmonks_advanced_stats_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}): ${writtenThisFixture} spelare skrivna`);
  }

  console.log(`\nKlart: ${playersWritten} spelar-matchrader skrivna.`);
  console.log(`Överhoppade (ej godkänd Fas 3-mappning): ${playersSkippedUnmapped}`);
  if (unknownTypeIds.size > 0) {
    console.log(`type_id utan kolumn (sparade i raw_types): ${[...unknownTypeIds].sort((a, b) => a - b).join(", ")}`);
  }
}
