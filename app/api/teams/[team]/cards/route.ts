import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCards, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/**
 * GET /api/teams/[team]/cards?type=yellow|red&season=2024&all_seasons=true&limit=10
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  try {
    const result = await getCards(supabase, {
      team: decodeURIComponent(teamIdentifier),
      cardType: searchParams.get("type") === "red" ? "red" : "yellow",
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
