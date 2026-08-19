import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export interface ResolvedPlayer {
  id: number;
  external_id: number | null;
  full_name: string;
}

/**
 * Matchar en identifierare — internt id, external_id, eller namn (helt
 * eller delvis, case-insensitive) — mot en spelare. Samma mönster som
 * resolve-team.ts. Bara ~141 spelare i databasen, så vi hämtar alla och
 * matchar i JS.
 */
export async function resolvePlayer(
  supabase: Supabase,
  identifier: string
): Promise<ResolvedPlayer | null> {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return null;

  if (/^\d+$/.test(needle)) {
    const numericId = Number(needle);
    const { data: byId } = await supabase
      .from("player")
      .select("id, external_id, full_name")
      .or(`id.eq.${numericId},external_id.eq.${numericId}`)
      .maybeSingle();
    if (byId) return byId;
  }

  const { data: players, error } = await supabase
    .from("player")
    .select("id, external_id, full_name");
  if (error || !players) return null;

  const exact = players.find((p) => p.full_name.toLowerCase() === needle);
  if (exact) return exact;

  const partial = players.find((p) => p.full_name.toLowerCase().includes(needle));
  return partial ?? null;
}
