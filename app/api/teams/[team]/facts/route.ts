import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamFacts, FootballDataError } from "@/lib/football/tools";

// Lagfakta (historia, smeknamn, legendarer) ändras nästan aldrig — cacha länge.
export const revalidate = 3600;

/**
 * GET /api/teams/[team]/facts
 * Smeknamn, grundat år, kort historia, troféer, klubblegendarer, rivaliteter.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();

  try {
    const result = await getTeamFacts(supabase, decodeURIComponent(teamIdentifier));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internt fel" }, { status: 500 });
  }
}
