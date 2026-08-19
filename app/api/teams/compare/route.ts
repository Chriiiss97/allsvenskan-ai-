import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamComparison, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/** GET /api/teams/compare?a=<lag>&b=<lag>&season=2024 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a") ?? "IFK Göteborg";
  const b = searchParams.get("b") ?? "AIK";

  try {
    const result = await getTeamComparison(supabase, {
      teamA: a,
      teamB: b,
      season: searchParams.get("season") ? Number(searchParams.get("season")) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internt fel" }, { status: 500 });
  }
}
