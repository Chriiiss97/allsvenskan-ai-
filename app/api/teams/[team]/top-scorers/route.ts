import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTeam } from "@/lib/football/resolve-team";

// Statistiken ändras bara när import-scriptet körs manuellt, inte i realtid
// — en måttlig cache räcker gott och sparar Supabase-anrop.
export const revalidate = 300;

interface StatRow {
  goals: number;
  assists: number;
  appearances: number;
  yellow_cards: number;
  red_cards: number;
  player: { id: number; full_name: string } | null;
  season: { year: number } | null;
}

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

  const team = await resolveTeam(supabase, decodeURIComponent(teamIdentifier));
  if (!team) {
    return NextResponse.json({ error: `Okänt lag: "${teamIdentifier}"` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const allSeasons = searchParams.get("all_seasons") === "true";
  const limit = Math.min(Number(searchParams.get("limit") ?? 10) || 10, 50);

  let seasonYear: number | null = null;
  if (seasonParam && !allSeasons) {
    seasonYear = Number(seasonParam);
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("year", seasonYear)
      .maybeSingle();
    if (!seasonRow) {
      return NextResponse.json({ error: `Ingen data för säsong ${seasonParam}` }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("statistics")
    .select(
      "goals, assists, appearances, yellow_cards, red_cards, player:player_id(id, full_name), season:season_id(year)"
    )
    .eq("team_id", team.id)
    .returns<StatRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = data ?? [];

  if (seasonYear) {
    rows = rows.filter((r) => r.season?.year === seasonYear);
  } else if (!allSeasons) {
    const latestYear = rows.reduce((max, r) => Math.max(max, r.season?.year ?? 0), 0);
    rows = rows.filter((r) => r.season?.year === latestYear);
    seasonYear = latestYear || null;
  }

  if (allSeasons) {
    const totals = new Map<
      number,
      { name: string; goals: number; assists: number; appearances: number }
    >();
    for (const r of rows) {
      if (!r.player) continue;
      const entry = totals.get(r.player.id) ?? {
        name: r.player.full_name,
        goals: 0,
        assists: 0,
        appearances: 0,
      };
      entry.goals += r.goals;
      entry.assists += r.assists;
      entry.appearances += r.appearances;
      totals.set(r.player.id, entry);
    }
    const scorers = [...totals.values()].sort((a, b) => b.goals - a.goals).slice(0, limit);
    return NextResponse.json({ team: team.name, scope: "all_seasons", scorers });
  }

  const scorers = rows
    .filter((r) => r.player)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)
    .map((r) => ({
      name: r.player!.full_name,
      goals: r.goals,
      assists: r.assists,
      appearances: r.appearances,
    }));

  return NextResponse.json({ team: team.name, season: seasonYear, scorers });
}
