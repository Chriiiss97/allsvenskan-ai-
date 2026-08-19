import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/**
 * GET /api/players/[player]/profile?season=2024
 * Bio + säsongsstatistik + ligasnitt (per-90, bara IFK/AIK-poolen).
 */
export async function GET(request: Request, { params }: { params: Promise<{ player: string }> }) {
  const { player: playerIdentifier } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  try {
    const result = await getPlayerProfile(supabase, {
      player: decodeURIComponent(playerIdentifier),
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
