import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

/**
 * Samma admin-klient som lib/supabase/admin.ts, men utan "server-only"-
 * importen. Den paketet kastar avsiktligt ett fel så fort den laddas utanför
 * Next.js/webpack-bundlern (den förlitar sig på bundlerns "react-server"-
 * villkor för att välja en no-op-variant) — vilket gör den oanvändbar i
 * fristående Node-script som körs med tsx, som import-scripten här.
 *
 * Använd bara den här varianten i /scripts, aldrig i appkoden — där ska
 * lib/supabase/admin.ts användas för att behålla skyddet mot att
 * service role-nyckeln av misstag bunt:as in i en klientkomponent.
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
