import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";

const DEFAULT_MAX_FIXTURES_PER_RUN = 700; // marginal over de 664 mappade fixturesen (Fas 2)

/**
 * xG-familjen, lagnivå. type_id-mappningen är EXAKT den vi verifierat live
 * denna session (Sportmonks-research + Fas 0:s sportmonks_type-cache) —
 * inte gissad. Se sportmonks_type-tabellen för namnen.
 */
const XG_TYPE_MAP: Record<number, string> = {
  5304: "xg",
  5305: "xgot",
  7943: "npxg",
  7945: "xg_open_play",
  7944: "xg_set_play",
  7942: "xg_corners",
  7941: "xg_free_kicks",
  7940: "xg_penalties", // overifierad forekomst (se migrationens filhuvud)
  9684: "xg_difference", // overifierad forekomst
  9687: "xg_against",
  9686: "xg_prevented",
  7939: "xpts",
  9685: "shooting_performance", // bekraftat befolkad, INNEBORD OVERIFIERAD — sparas men konsumeras inte av analyskod
};

interface XgFixtureRow {
  type_id: number;
  participant_id: number;
  data: { value: number | boolean | string };
}

export async function importSportmonksXg(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const { data: teams } = await supabase.from("team").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const teamIdBySportmonksId = new Map((teams ?? []).map((t) => [t.sportmonks_id!, t.id]));

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, status")
    .not("sportmonks_id", "is", null)
    .is("sportmonks_xg_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta xG för.");
    return;
  }
  console.log(`Hämtar xG för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  const unknownTypeIds = new Set<number>();
  let written = 0;

  for (const fixture of fixtures) {
    const { data } = await sportmonksGet<{ xgfixture?: XgFixtureRow[] }>(`football/fixtures/${fixture.sportmonks_id}`, {
      include: "xgfixture",
    });
    const rows = data.xgfixture ?? [];

    const byTeam = new Map<number, Record<string, number>>();
    for (const r of rows) {
      const column = XG_TYPE_MAP[r.type_id];
      if (!column) {
        unknownTypeIds.add(r.type_id);
        continue;
      }
      if (typeof r.data.value !== "number") continue;
      const teamId = teamIdBySportmonksId.get(r.participant_id);
      if (!teamId) continue; // lag som inte gick att mappa i Fas 1 (t.ex. Landskrona)
      const row = byTeam.get(teamId) ?? {};
      row[column] = r.data.value;
      byTeam.set(teamId, row);
    }

    for (const [teamId, row] of byTeam) {
      const { error: upsertError } = await supabase
        .from("fixture_team_xg")
        .upsert({ fixture_id: fixture.id, team_id: teamId, ...row }, { onConflict: "fixture_id,team_id" });
      if (upsertError) throw upsertError;
      written++;
    }

    await supabase.from("fixture").update({ sportmonks_xg_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}): ${byTeam.size} lags xG`);
  }

  console.log(`\nKlart: ${written} lag-matchrader skrivna.`);
  if (unknownTypeIds.size > 0) {
    console.log(`Okända type_id (inte i XG_TYPE_MAP), hoppade över: ${[...unknownTypeIds].join(", ")}`);
  }
}
