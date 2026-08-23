import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeMatches } from "@/scripts/import/finalize-match";
import { refreshOvr } from "@/scripts/import/refresh-ovr";
import { importStandings } from "@/scripts/import/import-standings";
import { logRateLimitSnapshot } from "@/lib/cron/rate-limit-snapshot";
import { getAvailableSeasons } from "@/lib/football/catalog";

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

    // OVR v2 (player_ratings): historiska säsonger ändras aldrig efter att de
    // räknats, så bara DEN AKTUELLA säsongen behöver uppdateras här — resten
    // backfillas en gång manuellt med `npm run import ovr`. Fail-open: en
    // misslyckad omräkning ska inte få finalize-avstämningen (redan klar ovan)
    // att rapporteras som ett fel.
    const [currentSeason] = await getAvailableSeasons(supabase);
    try {
      if (currentSeason) {
        await refreshOvr(supabase, { seasonYears: [currentSeason.year], log: () => {} });
      }
    } catch (ratingErr) {
      console.error("[cron/finalize] OVR-omräkning misslyckades (fail-open):", ratingErr);
    }

    // standings (Fas 14.0): tabellen importerades tidigare bara manuellt —
    // "Tabeller" i sidomenyn var inaktiverad delvis av det skälet. Samma
    // fail-open-princip och samma "bara aktuell säsong"-avgränsning som
    // ratingfräschningen ovan (se kommentar i import-standings.ts).
    try {
      if (currentSeason) {
        await importStandings({ seasonYear: currentSeason.year });
      }
    } catch (standingsErr) {
      console.error("[cron/finalize] standings-import misslyckades (fail-open):", standingsErr);
    }

    await logRateLimitSnapshot(supabase, "cron-finalize");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/finalize] misslyckades:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
