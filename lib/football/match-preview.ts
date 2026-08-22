import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 14.6 (plans/humble-giggling-biscuit.md) — Match Preview, byggd på
 * `fixture_match_facts` (Fas 7, Sportmonks). Ren läsning/gruppering av
 * redan importerad data, ingen ny import.
 *
 * VERIFIERAT mot riktig data (fixture 3455, Häcken–Halmstad) innan bygge:
 * `basis` är antingen "h2h" (inbördes möten) eller "team" (lagets EGNA
 * senaste form, oberoende av motståndare — INTE "overall", en felaktig
 * gissning i ett tidigare utkast, rättad efter en andra, snävare
 * kontrollfråga mot just den här fixturen) — `category` är "statistics"
 * (andelar/snitt), "streaks" (sviter), "players" (individuella
 * jämförelser), "statistic_comparisons" eller "coaches" (de två sistnämnda
 * INTE inkluderade här — outforskat innehåll, byggs bara in när det är
 * verifierat, inte gissat). Sportmonks levererar redan en färdig `natural_language`-
 * mening för de flesta rader (108/500 i stickprovet) — den ANVÄNDS direkt
 * istället för att omtolkas ur råa data-fält, eftersom en egen
 * omformulering av en statistikmening är en reell felkälla (fel tecken,
 * fel jämförelseriktning) som "gissa aldrig"-principen inte tillåter.
 *
 * KÄND, MEDVETEN BEGRÄNSNING: `natural_language` är på ENGELSKA
 * (Sportmonks eget språk), i en annars svensk UI — se rubriker/etiketter
 * runt citaten, som ÄR på svenska. Bedömt säkrare än att maskin-/hand-
 * översätta en statistikmening (risk att vända en jämförelse fel) — flaggat
 * explicit till användaren i Fas 14.6:s sammanfattning, inte tyst dolt.
 *
 * "Saknade spelare" (skador/avstängningar) undersöktes INNAN bygget
 * (stickprov 1000 rader med icke-null data): `related_player.sidelined`
 * fanns som fält men var 0/1000 sant, ingen dedikerad injury/lineup-
 * kategori existerar i basis/category-kombinationerna. Byggs alltså INTE
 * — hade varit en tom, missvisande sektion.
 *
 * 2024 har noll rader (Fas 7:s täckningsanalys: 2024=0, 2025=27 788,
 * 2026=79 337) — `available: false` för den säsongen, ingen sektion visas
 * alls (aldrig en tom platshållare).
 */

export interface MatchFact {
  sportmonksTypeId: number;
  participant: "home" | "away" | null;
  naturalLanguage: string;
}

export interface MatchPreviewData {
  available: boolean;
  /** Inbördes möten — basis="h2h". */
  headToHead: MatchFact[];
  /** Respektive lags egen senaste form, oberoende av motståndare — basis="team", category="streaks". */
  form: MatchFact[];
  /** Individuella spelarjämförelser — category="players". */
  players: MatchFact[];
}

interface FactRow {
  sportmonks_type_id: number;
  participant: string | null;
  basis: string | null;
  category: string | null;
  natural_language: string | null;
}

export async function getMatchPreview(supabase: Supabase, fixtureId: number): Promise<MatchPreviewData> {
  // Sidnumrerad — samma "över 1000-radstaket"-försiktighet som resten av
  // projektet redan etablerat (se lib/football/team-rollup.ts m.fl.).
  const rows: FactRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fixture_match_facts")
      .select("sportmonks_type_id, participant, basis, category, natural_language")
      .eq("fixture_id", fixtureId)
      .not("natural_language", "is", null)
      .range(from, from + PAGE - 1)
      .returns<FactRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  function toFact(r: FactRow): MatchFact {
    return {
      sportmonksTypeId: r.sportmonks_type_id,
      participant: r.participant === "home" || r.participant === "away" ? r.participant : null,
      naturalLanguage: r.natural_language as string,
    };
  }

  return {
    available: rows.length > 0,
    headToHead: rows.filter((r) => r.basis === "h2h" && r.category !== "players").map(toFact),
    form: rows.filter((r) => r.basis === "team" && r.category === "streaks").map(toFact),
    players: rows.filter((r) => r.category === "players").map(toFact),
  };
}
