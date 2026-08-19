import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600;

/**
 * GET /api/league/facts
 * Fakta om Allsvenskan (grundat år, format, rekord) — bara en liga i v1,
 * så inget behov av path-param än. Se PROJEKT_BRIEF.md för principen om
 * att schemat ska klara fler ligor senare utan ombyggnad.
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("league")
    .select("name, country, founded_year, short_history, league_fact(label, description, year)")
    .eq("external_id", 113)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
