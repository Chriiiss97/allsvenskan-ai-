import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Supabase-klient för användning i klientkomponenter ("use client").
 * Använder anon-nyckeln, som är säker att exponera i webbläsaren —
 * Row Level Security i databasen avgör vad den faktiskt får läsa/skriva.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
