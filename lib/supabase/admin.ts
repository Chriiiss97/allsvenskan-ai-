import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Admin-klient som använder service role-nyckeln och därmed kringgår
 * Row Level Security helt.
 *
 * ENDAST för server-kod som redan har verifierat behörighet själv:
 * import-script (steg 3), interna cron-jobb, admin-API-routes.
 * Importeras aldrig i en klientkomponent — "server-only" gör att bygget
 * failar om det ändå skulle hända av misstag.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i miljövariablerna."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
