import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPreMatchPipeline } from "@/scripts/import/pre-match-pipeline";
import { logRateLimitSnapshot } from "@/lib/cron/rate-limit-snapshot";

export const dynamic = "force-dynamic";

/**
 * Steg 10 — cron-triggerbar version av steg 5:s pre-match-pipeline (skador +
 * laguppställning). Se vercel.json för schemat. Rekommenderat intervall
 * (~30 min) kräver Vercel Pro — Hobby tillåter bara en körning/dygn, se
 * kommentaren i vercel.json.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await runPreMatchPipeline(supabase);
    await logRateLimitSnapshot(supabase, "cron-pre-match");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/pre-match] misslyckades:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
