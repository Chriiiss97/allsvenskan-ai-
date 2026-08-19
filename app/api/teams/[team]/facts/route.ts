import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTeam } from "@/lib/football/resolve-team";

// Lagfakta (historia, smeknamn, legendarer) ändras nästan aldrig — cacha länge.
export const revalidate = 3600;

/**
 * GET /api/teams/[team]/facts
 * Smeknamn, grundat år, kort historia, troféer, klubblegendarer, rivaliteter.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();

  const team = await resolveTeam(supabase, decodeURIComponent(teamIdentifier));
  if (!team) {
    return NextResponse.json({ error: `Okänt lag: "${teamIdentifier}"` }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("team")
    .select(
      "name, nicknames, founded_year, short_history, website_url, venue_name, logo_url, " +
        "team_trophy(competition, year), " +
        "team_legend(name, period, role, description), " +
        "team_rivalry!team_rivalry_team_id_fkey(rival_name, description)"
    )
    .eq("id", team.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
