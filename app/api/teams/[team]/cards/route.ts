import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTeam } from "@/lib/football/resolve-team";

export const revalidate = 300;

interface StatRow {
  goals: number;
  appearances: number;
  yellow_cards: number;
  red_cards: number;
  player: { id: number; full_name: string } | null;
  season: { year: number } | null;
}

/**
 * GET /api/teams/[team]/cards?type=yellow|red&season=2024&all_seasons=true&limit=10
 * Samma säsongslogik som top-scorers — se den routen för motivering.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team: teamIdentifier } = await params;
  const supabase = await createClient();

  const team = await resolveTeam(supabase, decodeURIComponent(teamIdentifier));
  if (!team) {
    return NextResponse.json({ error: `Okänt lag: "${teamIdentifier}"` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const cardType = searchParams.get("type") === "red" ? "red" : "yellow";
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
    .select("goals, appearances, yellow_cards, red_cards, player:player_id(id, full_name), season:season_id(year)")
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

  const cardField = cardType === "red" ? "red_cards" : "yellow_cards";

  if (allSeasons) {
    const totals = new Map<number, { name: string; yellow_cards: number; red_cards: number }>();
    for (const r of rows) {
      if (!r.player) continue;
      const entry = totals.get(r.player.id) ?? {
        name: r.player.full_name,
        yellow_cards: 0,
        red_cards: 0,
      };
      entry.yellow_cards += r.yellow_cards;
      entry.red_cards += r.red_cards;
      totals.set(r.player.id, entry);
    }
    const players = [...totals.values()]
      .sort((a, b) => b[cardField] - a[cardField])
      .slice(0, limit);
    return NextResponse.json({ team: team.name, scope: "all_seasons", cardType, players });
  }

  const players = rows
    .filter((r) => r.player)
    .sort((a, b) => b[cardField] - a[cardField])
    .slice(0, limit)
    .map((r) => ({ name: r.player!.full_name, yellow_cards: r.yellow_cards, red_cards: r.red_cards }));

  return NextResponse.json({ team: team.name, season: seasonYear, cardType, players });
}
