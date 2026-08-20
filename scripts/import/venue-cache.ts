import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Samma mönster som team-cache.ts: external_id -> internt id, skapar en
 * minimal rad (bara namn/stad) om arenan inte redan finns. De flesta arenor
 * finns redan från steg 3:s lag-import (som fick fullständig arenadata
 * inbäddad), den här cachen täcker bara undantag — t.ex. en bortalagsarena
 * vi inte sett förut.
 */
export function createVenueCache(supabase: Supabase) {
  const cache = new Map<number, number>();

  return {
    async ensure(apiVenue: { id: number | null; name: string | null; city?: string | null }): Promise<number | null> {
      if (!apiVenue.id) return null;

      const cached = cache.get(apiVenue.id);
      if (cached) return cached;

      const { data: existing } = await supabase
        .from("venue")
        .select("id")
        .eq("external_id", apiVenue.id)
        .maybeSingle();
      if (existing) {
        cache.set(apiVenue.id, existing.id);
        return existing.id;
      }

      const { data: created, error } = await supabase
        .from("venue")
        .upsert(
          { external_id: apiVenue.id, name: apiVenue.name ?? "Okänd arena", city: apiVenue.city ?? null },
          { onConflict: "external_id" }
        )
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error(`Kunde inte skapa arena ${apiVenue.name}`);

      cache.set(apiVenue.id, created.id);
      return created.id;
    },
  };
}
