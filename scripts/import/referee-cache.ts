import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Domare har INGET externt ID från API-Football (bara ett namnfält på
 * fixture, bekräftat i steg 1) — cachen nyckar alltså på exakt namn, en känd
 * svaghet dokumenterad i migrationen (samma domare skulle i teorin kunna
 * dyka upp stavad olika mellan matcher).
 */
export function createRefereeCache(supabase: Supabase) {
  const cache = new Map<string, number>();

  return {
    async ensure(fullName: string | null): Promise<number | null> {
      if (!fullName) return null;
      // Vissa svar har extra info efter namnet, t.ex. "K. Karlsson, Sweden" —
      // vi vill bara namnet.
      const name = fullName.split(",")[0].trim();
      if (!name) return null;

      const cached = cache.get(name);
      if (cached) return cached;

      const { data: existing } = await supabase.from("referee").select("id").eq("full_name", name).maybeSingle();
      if (existing) {
        cache.set(name, existing.id);
        return existing.id;
      }

      const { data: created, error } = await supabase
        .from("referee")
        .upsert({ full_name: name }, { onConflict: "full_name" })
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error(`Kunde inte skapa domare ${name}`);

      cache.set(name, created.id);
      return created.id;
    },
  };
}
