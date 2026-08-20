import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiFixtureStatisticsResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { createTeamCache } from "./team-cache";

const DEFAULT_MAX_FIXTURES_PER_RUN = 800;

/**
 * API:t ger statistiken som en platt lista av { type, value }-par (se
 * lib/api-football/types.ts) — den här mappningen är de EXAKTA sträng-
 * etiketterna bekräftade i steg 1, inte gissade. "Ball Possession"/"Passes %"
 * kommer som text ("64%") och parsas till heltal; expected_goals/
 * goals_prevented kommer som text-tal ("2.02") och parsas till nummer.
 */
const STAT_FIELD_MAP: Record<string, string> = {
  "Shots on Goal": "shots_on_goal",
  "Shots off Goal": "shots_off_goal",
  "Total Shots": "shots_total",
  "Blocked Shots": "shots_blocked",
  "Shots insidebox": "shots_inside_box",
  "Shots outsidebox": "shots_outside_box",
  Fouls: "fouls",
  "Corner Kicks": "corners",
  Offsides: "offsides",
  "Ball Possession": "possession_pct",
  "Yellow Cards": "yellow_cards",
  "Red Cards": "red_cards",
  "Goalkeeper Saves": "goalkeeper_saves",
  "Total passes": "passes_total",
  "Passes accurate": "passes_accurate",
  "Passes %": "passes_pct",
  expected_goals: "expected_goals",
  goals_prevented: "goals_prevented",
};
const PERCENT_FIELDS = new Set(["possession_pct", "passes_pct"]);
const DECIMAL_FIELDS = new Set(["expected_goals", "goals_prevented"]);

function parseStatValue(column: string, raw: string | number | null): number | null {
  if (raw === null) return null;
  if (typeof raw === "number") return raw;
  const cleaned = PERCENT_FIELDS.has(column) ? raw.replace("%", "") : raw;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return DECIMAL_FIELDS.has(column) || PERCENT_FIELDS.has(column) ? n : Math.round(n);
}

export async function importTeamStats(maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN) {
  const supabase = createAdminClient();
  const teamCache = createTeamCache(supabase);

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, external_id, status")
    .is("statistics_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);

  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta lagstatistik för.");
    return;
  }
  console.log(`Hämtar lagstatistik för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  for (const fixture of fixtures) {
    if (!fixture.external_id) continue;

    const { data: teamStats } = await apiFootballGet<ApiFixtureStatisticsResponse>("/fixtures/statistics", {
      fixture: fixture.external_id,
    });

    for (const t of teamStats) {
      const teamId = await teamCache.ensure(t.team);
      const row: Record<string, number | null> = {};
      for (const s of t.statistics) {
        const column = STAT_FIELD_MAP[s.type];
        if (!column) continue; // okänd/ny stat-typ — hoppa över hellre än att gissa en kolumn
        row[column] = parseStatValue(column, s.value);
      }

      const { error: statError } = await supabase
        .from("fixture_team_stats")
        .upsert({ fixture_id: fixture.id, team_id: teamId, ...row }, { onConflict: "fixture_id,team_id" });
      if (statError) throw statError;
    }

    await supabase.from("fixture").update({ statistics_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ Match ${fixture.external_id}: ${teamStats.length} lags statistik`);
  }
}
