import { sportmonksGetAllTypes } from "../../lib/sportmonks/client";
import type { SportmonksType } from "../../lib/sportmonks/types";
import { createAdminClient } from "./admin-client";

/**
 * Fyller sportmonks_type-cachen från /v3/core/types. Körs sällan (typerna
 * ändras knappt) — INTE en del av 'all'/cron, samma princip som `facts`.
 * ~1125+ rader bekräftade denna session (25/sida, ingen per_page-styrning
 * möjlig, se sportmonksGetAllTypes). Egen kvotbudget ("core"-entiteten),
 * konkurrerar inte med fixture-relaterade importer.
 */
export async function importSportmonksTypes() {
  const supabase = createAdminClient();

  console.log("Hämtar Sportmonks-typregister (/v3/core/types)...");
  const types = await sportmonksGetAllTypes<SportmonksType>();
  console.log(`  Hämtade ${types.length} typer, skriver till sportmonks_type...`);

  for (const t of types) {
    const { error } = await supabase.from("sportmonks_type").upsert(
      {
        id: t.id,
        name: t.name,
        code: t.code,
        stat_group: t.stat_group,
        raw: t,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  console.log(`  ✓ ${types.length} Sportmonks-typer sparade.`);
}
