import { createAdminClient } from "./admin-client";
import { LEAGUE_FACTS } from "./league-facts-data";

/**
 * Skriver in manuellt insamlad liganivåfakta (LEAGUE_FACTS) i databasen.
 * Ingen API-Football-koppling — kostar inget av dagskvoten.
 *
 * league_fact saknar en naturlig unique-kolumn för upsert, så vi tar bort
 * och skriver om raderna för ligan varje körning (samma mönster som
 * seed-team-facts.ts för team_trophy/team_legend/team_rivalry).
 */
export async function seedLeagueFacts() {
  const supabase = createAdminClient();

  const { data: league, error: leagueLookupError } = await supabase
    .from("league")
    .select("id, name")
    .eq("external_id", LEAGUE_FACTS.externalId)
    .single();
  if (leagueLookupError || !league) {
    console.warn(`! Liga med external_id ${LEAGUE_FACTS.externalId} saknas, hoppar över.`);
    return;
  }

  console.log(`Skriver liganivåfakta: ${league.name}...`);

  const { error: updateError } = await supabase
    .from("league")
    .update({ founded_year: LEAGUE_FACTS.foundedYear, short_history: LEAGUE_FACTS.shortHistory })
    .eq("id", league.id);
  if (updateError) throw updateError;

  await supabase.from("league_fact").delete().eq("league_id", league.id);
  if (LEAGUE_FACTS.facts.length > 0) {
    const { error } = await supabase.from("league_fact").insert(
      LEAGUE_FACTS.facts.map((f) => ({
        league_id: league.id,
        label: f.label,
        description: f.description,
        year: f.year ?? null,
      }))
    );
    if (error) throw error;
  }

  console.log(`  ✓ grundat ${LEAGUE_FACTS.foundedYear}, ${LEAGUE_FACTS.facts.length} fakta/rekord`);
}
