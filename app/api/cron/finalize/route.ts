import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeMatches } from "@/scripts/import/finalize-match";
import { logRateLimitSnapshot } from "@/lib/cron/rate-limit-snapshot";

export const dynamic = "force-dynamic";
// Går igenom alla avslutade matcher (2 549+ och växande) varje körning —
// snabbare än de andra jobben (ingen väntan mellan API-anrop krävs för
// avstämningsdelen), men ger den mer marginal än standard-limiten ändå.
export const maxDuration = 60;

/**
 * Steg 10 — cron-triggerbar version av steg 7:s post-match-avstämning
 * (sista full refresh + eventsComplete-avstämning mot ingestion_log).
 * Se vercel.json — en gång/dygn räcker gott (matchar Hobby-planens
 * gräns också, till skillnad från pre-match/live).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await finalizeMatches(supabase);
    await logRateLimitSnapshot(supabase, "cron-finalize");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/finalize] misslyckades:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
