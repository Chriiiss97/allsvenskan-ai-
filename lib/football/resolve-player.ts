import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { displayPlayerName } from "./player-name";
import { matchesSearchTokens, normalizeSearchText, tokenizeSearchQuery } from "./player-search";
import { fetchAllRows } from "@/lib/supabase/paginate";

type Supabase = SupabaseClient<Database>;

export interface ResolvedPlayer {
  id: number;
  external_id: number | null;
  full_name: string;
}

interface PlayerNameRow extends ResolvedPlayer {
  first_name: string | null;
  last_name: string | null;
}

/**
 * Matchar en identifierare — internt id, external_id, eller namn (helt
 * eller delvis, case-insensitive) — mot en spelare. Samma mönster som
 * resolve-team.ts.
 *
 * Fas 21 (2026-08-23): matchar mot VISNINGSNAMNET ("Markus Berg") lika väl
 * som mot api-footballs förkortning i full_name ("M. Berg") och de råa
 * för-/efternamnsfälten. Sedan listorna visar riktiga förnamn är det just
 * "Markus Berg" en användare skriver i chatten — det måste träffa samma
 * spelare som länken bredvid. Samma tokenmatchning som spelarsökningen
 * (ordning spelar ingen roll, diakriter ignoreras).
 */
export async function resolvePlayer(
  supabase: Supabase,
  identifier: string
): Promise<ResolvedPlayer | null> {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return null;

  if (/^\d+$/.test(needle)) {
    const numericId = Number(needle);
    const { data: byId } = await supabase
      .from("player")
      .select("id, external_id, full_name")
      .or(`id.eq.${numericId},external_id.eq.${numericId}`)
      .maybeSingle();
    if (byId) return byId;
  }

  // Hela player-tabellen (2 305 rader) — måste sidnumreras, annars kapar
  // PostgREST tyst listan vid 1000 och spelare längre ned blir omöjliga att
  // slå upp i chatten. Se lib/supabase/paginate.ts.
  const players = await fetchAllRows<PlayerNameRow>((from, to) =>
    supabase
      .from("player")
      .select("id, external_id, full_name, first_name, last_name")
      .order("id")
      .range(from, to)
      .returns<PlayerNameRow[]>()
  );

  const candidates = players.map((p) => ({
    player: { id: p.id, external_id: p.external_id, full_name: p.full_name },
    names: [
      displayPlayerName(p.first_name, p.last_name, p.full_name),
      p.full_name,
      [p.first_name, p.last_name].filter(Boolean).join(" "),
      p.last_name ?? "",
    ].filter(Boolean),
  }));

  const normalizedNeedle = normalizeSearchText(needle);
  const exact = candidates.find((c) => c.names.some((n) => normalizeSearchText(n) === normalizedNeedle));
  if (exact) return exact.player;

  const tokens = tokenizeSearchQuery(needle);
  const tokenMatch = candidates.find((c) => matchesSearchTokens(tokens, c.names));
  if (tokenMatch) return tokenMatch.player;

  const partial = candidates.find((c) => c.names.some((n) => normalizeSearchText(n).includes(normalizedNeedle)));
  return partial?.player ?? null;
}
