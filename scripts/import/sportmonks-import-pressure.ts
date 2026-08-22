import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";

const DEFAULT_MAX_FIXTURES_PER_RUN = 700;

interface PressureRow {
  id: number;
  fixture_id: number;
  participant_id: number;
  minute: number;
  pressure: number;
}

/**
 * Pressure Index — minutupplöst matchmomentum. Bekräftat live tidigare
 * denna session (fixture 19635913): 186 rader/match, ~1 rad per (lag,
 * minut). River den tidigare dokumenterade PERMANENTA begränsningen i
 * DATA_CATALOG.md ("retroaktiv matchmomentum: EJ MÖJLIGT med API-Football")
 * — och det gäller retroaktivt, inte bara framåt (verifierat: fungerar på
 * redan avslutade matcher från alla tre säsonger 2024/2025/2026).
 *
 * Ingen unique-constraint på fixture_pressure_index än (se Fas 0-migrationen)
 * — grain bekräftas i denna fasens verifiering innan en läggs till i en
 * uppföljande migration.
 */
export async function importSportmonksPressure(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const { data: teams } = await supabase.from("team").select("id, sportmonks_id").not("sportmonks_id", "is", null);
  const teamIdBySm = new Map((teams ?? []).map((t) => [t.sportmonks_id!, t.id]));

  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, status")
    .not("sportmonks_id", "is", null)
    .is("sportmonks_pressure_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta Pressure Index för.");
    return;
  }
  console.log(`Hämtar Pressure Index för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  let written = 0;
  for (const fixture of fixtures) {
    const { data } = await sportmonksGet<{ pressure?: PressureRow[] }>(`football/fixtures/${fixture.sportmonks_id}`, {
      include: "pressure",
    });
    const rows = data.pressure ?? [];

    // Delete+insert per fixture — samma säkra-att-köra-om-mönster som Fas 5b.
    await supabase.from("fixture_pressure_index").delete().eq("fixture_id", fixture.id);
    if (rows.length > 0) {
      const insertRows = rows
        .map((r) => {
          const teamId = teamIdBySm.get(r.participant_id);
          if (!teamId) return null;
          return { fixture_id: fixture.id, team_id: teamId, minute: r.minute, pressure: r.pressure, sportmonks_row_id: r.id };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (insertRows.length > 0) {
        const { error: insertError } = await supabase.from("fixture_pressure_index").insert(insertRows);
        if (insertError) throw insertError;
      }
      written += insertRows.length;
    }

    await supabase.from("fixture").update({ sportmonks_pressure_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}): ${rows.length} tryckavläsningar`);
  }

  console.log(`\nKlart: ${written} tryckavläsningar skrivna.`);
}
