import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface ResolvedTeam {
  id: number;
  external_id: number | null;
  name: string;
  nicknames: string[];
}

/**
 * Matchar en fri textidentifierare (lagnamn, smeknamn som "Blåvitt"/"Gnaget",
 * eller external_id) mot en lag-rad i databasen.
 *
 * Bara ~20 lag i databasen just nu (de importerade lagen + motståndare från
 * matchimporten), så vi hämtar alla och matchar case-insensitive i JS
 * istället för att bråka med array-matchning i Postgres. Om datamängden
 * växer rejält (fler ligor/säsonger) är detta första stället att optimera.
 *
 * Normaliserar bort diakritiska tecken (ö/ä/å -> o/a/a) på båda sidor —
 * API-Football lagrar lagnamn utan svenska tecken ("IFK Goteborg"), men
 * användare skriver förstås "Göteborg".
 */
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function resolveTeam(
  supabase: SupabaseClient<Database>,
  identifier: string
): Promise<ResolvedTeam | null> {
  const { data: teams, error } = await supabase
    .from("team")
    .select("id, external_id, name, nicknames");
  if (error || !teams) return null;

  const needle = normalize(identifier);
  if (!needle) return null;

  if (/^\d+$/.test(needle)) {
    const byExternalId = teams.find((t) => String(t.external_id) === needle);
    if (byExternalId) return byExternalId;
  }

  const byName = teams.find((t) => normalize(t.name) === needle);
  if (byName) return byName;

  const byNickname = teams.find((t) => t.nicknames.some((n) => normalize(n) === needle));
  if (byNickname) return byNickname;

  // Sista utväg: delsträngsmatchning på namn (t.ex. "göteborg" -> "IFK Goteborg").
  const byPartialName = teams.find((t) => normalize(t.name).includes(needle));
  return byPartialName ?? null;
}
