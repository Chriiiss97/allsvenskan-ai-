import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { comparePlayers, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/** GET /api/players/compare?a=<spelare>&b=<spelare>&season=2024 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json({ error: "Ange både a och b (spelaridentifierare)" }, { status: 400 });
  }

  try {
    const result = await comparePlayers(supabase, {
      playerA: a,
      playerB: b,
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
