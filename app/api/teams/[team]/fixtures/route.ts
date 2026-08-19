import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTeam } from "@/lib/football/resolve-team";

export const revalidate = 300;

interface FixtureRow {
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  home: { id: number; name: string } | null;
  away: { id: number; name: string } | null;
  season: { year: number } | null;
}

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

  const team = await resolveTeam(supabase, decodeURIComponent(teamIdentifier));
  if (!team) {
    return NextResponse.json({ error: `Okänt lag: "${teamIdentifier}"` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const opponentParam = searchParams.get("opponent");
  const limit = Math.min(Number(searchParams.get("limit") ?? 10) || 10, 50);

  let opponentId: number | null = null;
  if (opponentParam) {
    const opponent = await resolveTeam(supabase, opponentParam);
    if (!opponent) {
      return NextResponse.json({ error: `Okänt motståndarlag: "${opponentParam}"` }, { status: 404 });
    }
    opponentId = opponent.id;
  }

  let query = supabase
    .from("fixture")
    .select(
      "kickoff_at, status, round, home_score, away_score, home:home_team_id(id, name), away:away_team_id(id, name), season:season_id(year)"
    )
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .order("kickoff_at", { ascending: false })
    .limit(limit);

  if (seasonParam) {
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("year", Number(seasonParam))
      .maybeSingle();
    if (!seasonRow) {
      return NextResponse.json({ error: `Ingen data för säsong ${seasonParam}` }, { status: 404 });
    }
    query = query.eq("season_id", seasonRow.id);
  }

  const { data, error } = await query.returns<FixtureRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let fixtures = data ?? [];
  if (opponentId) {
    fixtures = fixtures.filter(
      (f) => f.home?.id === opponentId || f.away?.id === opponentId
    );
  }

  return NextResponse.json({
    team: team.name,
    fixtures: fixtures.map((f) => ({
      date: f.kickoff_at,
      season: f.season?.year ?? null,
      round: f.round,
      status: f.status,
      home: f.home?.name ?? null,
      away: f.away?.name ?? null,
      home_score: f.home_score,
      away_score: f.away_score,
    })),
  });
}
