import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getLastRateLimitReading } from "@/lib/api-football/client";

/**
 * Steg 10: loggar den senast sedda dygnskvot-avläsningen (API:ts egna
 * x-ratelimit-headrar, se lib/api-football/client.ts) till ingestion_log
 * efter en cron-körning — grunden för adminpanelens calls-budget-vy.
 * Skriver ingen rad om jobbet inte gjorde några API-anrop (t.ex. inga
 * kommande matcher inom pre-match-fönstret) — en avläsning kan bara komma
 * från ett riktigt svar, aldrig uppskattas.
 */
export async function logRateLimitSnapshot(supabase: SupabaseClient<Database>, jobName: string) {
  const reading = getLastRateLimitReading();
  if (!reading) return;

  await supabase.from("ingestion_log").insert({
    job_name: jobName,
    endpoint: "rate-limit-snapshot",
    params: { remaining: reading.remaining, limit: reading.limit },
    calls_used: 0,
    rows_written: 0,
    status: "success",
    finished_at: new Date().toISOString(),
  });
}
