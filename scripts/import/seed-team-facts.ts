import { createAdminClient } from "./admin-client";
import { TEAM_FACTS } from "./team-facts-data";

/**
 * Skriver in den manuellt insamlade lagfakta (TEAM_FACTS) i databasen.
 * Inga API-Football-anrop — kostar inget av dagskvoten.
 *
 * team_trophy/team_legend/team_rivalry saknar en naturlig unique-kolumn att
 * göra upsert mot, så vi tar bort och skriver om raderna för de berörda
 * lagen varje körning (delete + insert) — gör scriptet säkert att köra om.
 */
export async function seedTeamFacts() {
  const supabase = createAdminClient();

  for (const facts of TEAM_FACTS) {
    const { data: teamRow, error: teamLookupError } = await supabase
      .from("team")
      .select("id, name")
      .eq("external_id", facts.externalId)
      .single();
    if (teamLookupError || !teamRow) {
      console.warn(`! Lag med external_id ${facts.externalId} saknas, hoppar över.`);
      continue;
    }

    console.log(`Skriver lagfakta: ${teamRow.name}...`);

    const { error: updateError } = await supabase
      .from("team")
      .update({ nicknames: facts.nicknames, short_history: facts.shortHistory })
      .eq("id", teamRow.id);
    if (updateError) throw updateError;

    await supabase.from("team_trophy").delete().eq("team_id", teamRow.id);
    if (facts.trophies.length > 0) {
      const { error } = await supabase.from("team_trophy").insert(
        facts.trophies.map((t) => ({ team_id: teamRow.id, competition: t.competition, year: t.year }))
      );
      if (error) throw error;
    }

    await supabase.from("team_legend").delete().eq("team_id", teamRow.id);
    if (facts.legends.length > 0) {
      const { error } = await supabase.from("team_legend").insert(
        facts.legends.map((l) => ({
          team_id: teamRow.id,
          name: l.name,
          period: l.period ?? null,
          role: l.role ?? null,
          description: l.description,
        }))
      );
      if (error) throw error;
    }

    await supabase.from("team_rivalry").delete().eq("team_id", teamRow.id);
    if (facts.rivalries.length > 0) {
      const rivalryRows = [];
      for (const r of facts.rivalries) {
        let rivalTeamId: number | null = null;
        if (r.rivalExternalId) {
          const { data: rivalRow } = await supabase
            .from("team")
            .select("id")
            .eq("external_id", r.rivalExternalId)
            .maybeSingle();
          rivalTeamId = rivalRow?.id ?? null;
        }
        rivalryRows.push({
          team_id: teamRow.id,
          rival_team_id: rivalTeamId,
          rival_name: r.rivalName,
          description: r.description,
        });
      }
      const { error } = await supabase.from("team_rivalry").insert(rivalryRows);
      if (error) throw error;
    }

    console.log(
      `  ✓ ${facts.nicknames.length} smeknamn, ${facts.trophies.length} troféer, ${facts.legends.length} legendarer, ${facts.rivalries.length} rivaliteter`
    );
  }
}
