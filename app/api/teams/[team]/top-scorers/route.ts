import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTopScorers, FootballDataError } from "@/lib/football/tools";

// Statistiken ändras bara när import-scriptet körs manuellt, inte i realtid
// — en måttlig cache räcker gott och sparar Supabase-anrop.
export const revalidate = 300;

/**
 * GET /api/teams/[team]/top-scorers?season=2024&all_seasons=true&limit=10
 *
 * - Utan `season`/`all_seasons`: senaste säsongen vi har data för (se
 *   scripts/import/config.ts — gratisplanen saknar innevarande säsong).
 * - `season=YYYY`: exakt säsong.
 * - `all_seasons=true`: summerat över alla importerade säsonger.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);

  try {
    const result = await getTopScorers(supabase, {
      team: decodeURIComponent(teamIdentifier),
      season: searchParams.get("season") ? Number(searchParams.get("season")) : undefined,
      allSeasons: searchParams.get("all_seasons") === "true",
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internt fel" }, { status: 500 });
  }
}
