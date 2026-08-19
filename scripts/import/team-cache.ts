import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Håller reda på external_id -> internt id för lag under en import-körning,
 * och skapar automatiskt en minimal lag-rad (bara namn + logga) för
 * motståndare som dyker upp i match-/händelsedata men som vi inte importerat
 * fullständig lagdata för (fixture.home_team_id/away_team_id är NOT NULL, så
 * en rad måste finnas). Kan fyllas i med mer data senare om/när fler lag
 * importeras på riktigt.
 */
export function createTeamCache(supabase: Supabase) {
  const cache = new Map<number, number>();

  return {
    async ensure(apiTeam: { id: number; name: string; logo?: string }): Promise<number> {
      const cached = cache.get(apiTeam.id);
      if (cached) return cached;

      const { data: existing } = await supabase
        .from("team")
        .select("id")
        .eq("external_id", apiTeam.id)
        .maybeSingle();

      if (existing) {
        cache.set(apiTeam.id, existing.id);
        return existing.id;
      }

      const { data: created, error } = await supabase
        .from("team")
        .upsert(
          { external_id: apiTeam.id, name: apiTeam.name, logo_url: apiTeam.logo ?? null },
          { onConflict: "external_id" }
        )
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error(`Kunde inte skapa lag ${apiTeam.name}`);

      cache.set(apiTeam.id, created.id);
      return created.id;
    },
  };
}
