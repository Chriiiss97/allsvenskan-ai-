import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFixtures, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/**
 * GET /api/teams/[team]/fixtures?season=2024&opponent=AIK&limit=10
 *
 * Utan parametrar: de senaste matcherna för laget. `opponent` filtrerar till
 * enbart inbördes möten mellan de två lagen (huvudanvändningen: "hur har det
 * gått mot X" / matchförhandsvisning).
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  try {
    const result = await getFixtures(supabase, {
      team: decodeURIComponent(teamIdentifier),
      season: searchParams.get("season") ? Number(searchParams.get("season")) : undefined,
      opponent: searchParams.get("opponent") ?? undefined,
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
