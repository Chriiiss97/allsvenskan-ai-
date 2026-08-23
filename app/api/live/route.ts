import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveFeedForToday, getLiveFeedForFixtures } from "@/lib/football/live-feed";

/**
 * Fas 20 (2026-08-23) — endpointen klientens live-polling frågar.
 *
 * MEDVETET INGEN `revalidate`: det här är den enda routen i appen där ett
 * cachat svar är direkt fel. (Jämför app/api/fixtures/[fixtureId]/report,
 * som deklarerar `revalidate = 300` — vilseledande på en yta som ska följa
 * en pågående match, även om cookie-läsningen ändå gör den dynamisk.)
 * Route Handlers cachas inte som standard i Next 16; `force-dynamic` här är
 * ett uttalat kontrakt, inte magi.
 *
 *   GET /api/live                 → dagens matcher + allt som pågår
 *   GET /api/live?fixture=123     → bara de matcherna (matchvyns polling)
 *
 * Svaret bär med sig `nextRefreshSeconds` så att takten bestäms på ETT
 * ställe (lib/football/live-feed.ts) istället för att varje komponent
 * hittar på ett eget intervall.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const fixtureParams = request.nextUrl.searchParams.getAll("fixture");
  const fixtureIds = fixtureParams
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  try {
    const feed = fixtureIds.length > 0 ? await getLiveFeedForFixtures(supabase, fixtureIds) : await getLiveFeedForToday(supabase);
    return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/live] misslyckades:", err);
    return NextResponse.json({ error: "Kunde inte hämta live-läget." }, { status: 500 });
  }
}
