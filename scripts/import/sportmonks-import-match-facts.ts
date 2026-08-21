import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";

const DEFAULT_MAX_FIXTURES_PER_RUN = 700;

interface MatchFactRow {
  id: number;
  fixture_id: number;
  type_id: number;
  participant: "home" | "away" | "both" | null;
  basis: string | null;
  scope: string | null;
  data: Record<string, unknown>;
  natural_language: string | null;
  category: string | null;
}

/**
 * value_shape-klassificering — EMPIRISK, byggd på riktiga payloads sedda
 * denna session: {"0-1":1,"2-3":2,...} (poängmönster-nycklar) =
 * distribution; {"all":{...},"home":{...},"away":{...}} = home_away;
 * en enkel {value: N} eller en enda skalär nyckel = scalar; allt annat
 * (t.ex. spelarnivå-jämförelser med fritextnycklar) = other. Stickprovas
 * mot faktiska payloads i denna fasens verifiering — se körlogg.
 */
function classifyValueShape(data: Record<string, unknown>): "scalar" | "home_away" | "distribution" | "other" {
  const keys = Object.keys(data);
  if (keys.length === 0) return "other";

  if (keys.length === 1 && (keys[0] === "value" || typeof data[keys[0]] !== "object")) return "scalar";

  const homeAwayKeys = new Set(["home", "away", "all"]);
  if (keys.length > 0 && keys.every((k) => homeAwayKeys.has(k))) return "home_away";

  const scorePattern = /^\d+-\d+$/;
  if (keys.length > 1 && keys.every((k) => scorePattern.test(k))) return "distribution";

  return "other";
}

/**
 * Sportmonks ger INGEN explicit player_id/team_id-kolumn i den råa match-
 * facts-raden (bara `participant`: 'home'|'away'|'both') — även när
 * `natural_language` namnger en specifik spelare (t.ex. "Sam Larsson has
 * the highest average xG...") finns ingen strukturerad spelar-id-koppling
 * att läsa. player_id lämnas därför ALLTID null (ingen gissning från
 * fritext) — team_id resolvas bara när participant är 'home'/'away'
 * (entydigt via fixturens egna lag), aldrig vid 'both'.
 */
export async function importSportmonksMatchFacts(
  maxFixturesPerRun = DEFAULT_MAX_FIXTURES_PER_RUN,
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
) {
  const { data: fixtures, error } = await supabase
    .from("fixture")
    .select("id, sportmonks_id, home_team_id, away_team_id, status")
    .not("sportmonks_id", "is", null)
    .is("sportmonks_match_facts_synced_at", null)
    .in("status", ["FT", "AET", "PEN"])
    .order("kickoff_at", { ascending: true })
    .limit(maxFixturesPerRun);
  if (error) throw error;
  if (!fixtures || fixtures.length === 0) {
    console.log("Inga matcher kvar att hämta Match Facts för.");
    return;
  }
  console.log(`Hämtar Match Facts för ${fixtures.length} matcher (tak: ${maxFixturesPerRun}/körning)...`);

  let written = 0;
  let zeroFactMatches = 0;
  const shapeCounts = new Map<string, number>();

  for (const fixture of fixtures) {
    const { data } = await sportmonksGet<{ matchfacts?: MatchFactRow[] }>(`football/fixtures/${fixture.sportmonks_id}`, {
      include: "matchfacts",
    });
    const facts = data.matchfacts ?? [];

    await supabase.from("fixture_match_facts").delete().eq("fixture_id", fixture.id);
    if (facts.length > 0) {
      const rows = facts.map((f) => {
        const shape = classifyValueShape(f.data);
        shapeCounts.set(shape, (shapeCounts.get(shape) ?? 0) + 1);
        const teamId = f.participant === "home" ? fixture.home_team_id : f.participant === "away" ? fixture.away_team_id : null;
        return {
          fixture_id: fixture.id,
          sportmonks_type_id: f.type_id,
          team_id: teamId,
          player_id: null,
          participant: f.participant,
          basis: f.basis,
          scope: f.scope,
          value_shape: shape,
          data: f.data,
          natural_language: f.natural_language,
          category: f.category,
          sportmonks_row_id: f.id,
        };
      });
      const { error: insertError } = await supabase.from("fixture_match_facts").insert(rows);
      if (insertError) throw insertError;
      written += rows.length;
    } else {
      zeroFactMatches++;
    }

    await supabase.from("fixture").update({ sportmonks_match_facts_synced_at: new Date().toISOString() }).eq("id", fixture.id);
    console.log(`  ✓ fixture ${fixture.id} (sm=${fixture.sportmonks_id}): ${facts.length} match facts`);
  }

  console.log(`\nKlart: ${written} match facts-rader skrivna.`);
  console.log(`Matcher med 0 match facts: ${zeroFactMatches} / ${fixtures.length}`);
  console.log("value_shape-fördelning:", Object.fromEntries(shapeCounts));
}
