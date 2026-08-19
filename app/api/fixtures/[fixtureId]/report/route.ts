import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMatchReport, FootballDataError } from "@/lib/football/tools";

export const revalidate = 300;

/** GET /api/fixtures/[fixtureId]/report */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const { fixtureId } = await params;
  const supabase = await createClient();

  try {
    const result = await getMatchReport(supabase, Number(fixtureId));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internt fel" }, { status: 500 });
  }
}
