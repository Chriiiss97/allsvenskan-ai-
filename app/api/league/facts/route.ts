import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeagueFacts, FootballDataError } from "@/lib/football/tools";

export const revalidate = 3600;

/**
 * GET /api/league/facts
 * Fakta om Allsvenskan (grundat år, format, rekord) — bara en liga i v1,
 * så inget behov av path-param än. Se PROJEKT_BRIEF.md för principen om
 * att schemat ska klara fler ligor senare utan ombyggnad.
 */
export async function GET() {
  const supabase = await createClient();

  try {
    const result = await getLeagueFacts(supabase);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internt fel" }, { status: 500 });
  }
}
