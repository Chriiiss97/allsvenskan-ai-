import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * external_id -> internt spelar-id, cachat under en körning. Skapar INGEN ny
 * rad om spelaren saknas (till skillnad från team-/venue-cache.ts) — sedan
 * steg 3 har vi redan alla spelare som spelat i Allsvenskan 2022–2024, så en
 * saknad träff betyder normalt en spelare utanför vårt scope, inte ett fel.
 */
export function createPlayerCache(supabase: Supabase) {
  const cache = new Map<number, number | null>();

  return {
    async lookup(externalId: number | null): Promise<number | null> {
      if (!externalId) return null;
      if (cache.has(externalId)) return cache.get(externalId)!;
      const { data } = await supabase.from("player").select("id").eq("external_id", externalId).maybeSingle();
      const id = data?.id ?? null;
      cache.set(externalId, id);
      return id;
    },
  };
}
