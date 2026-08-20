import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLiveTick } from "@/scripts/import/live-pipeline";
import { logRateLimitSnapshot } from "@/lib/cron/rate-limit-snapshot";

export const dynamic = "force-dynamic";

/**
 * Steg 10 — cron-triggerbar version av steg 6:s live-pipeline (en "tick").
 * Se vercel.json. Vercel Cron:s finaste granularitet är en gång/minut
 * (Pro-krav, se vercel.json) — grovare än planens ursprungliga ~45–60s-mål,
 * men nära nog för possession/skott/hörnor som ändå bara uppdateras var
 * tredje minut internt (se live-pipeline.ts:s STATS_REFRESH_MINUTES).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await runLiveTick(supabase);
    await logRateLimitSnapshot(supabase, "cron-live");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/live] misslyckades:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
