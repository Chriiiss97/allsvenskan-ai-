/**
 * Fas 22b (2026-08-23, användarkrav) — bygger `lib/football/club-country.ts`:
 * en komplett uppslagning från api-footballs klubb-id till klubbens LAND.
 *
 * ── VARFÖR ───────────────────────────────────────────────────────────────
 * "Värvningar till Allsvenskan" måste kunna avgöra om avsändarklubben är
 * svensk eller utländsk. Första versionen härledde det ur
 * `player_career_stint` (vilken liga klubben spelat i) — men den datan finns
 * bara för klubbar där NÅGON spelare i vår databas har en importerad säsong.
 * Mätning 2026-08-23: av 1 967 klubbar i transferdatan hade bara 1 013 ett
 * verifierbart land den vägen. Följden var att 1 127 övergångar TILL en
 * allsvensk klubb ströks som "gick inte att verifiera" — både svenska
 * lägre-divisionsklubbar (Tvååker, Skövde AIK, Lund) som SKA bort, och
 * riktiga utlandsvärvningar (AB Copenhagen, Kano Pillars, Toronto II) som
 * felaktigt försvann.
 *
 * api-footballs `/teams?id=` svarar med klubbens land direkt — verifierat
 * mot stickprov innan skriptet skrevs:
 *   6703 → Tvååker (Sweden) · 5183 → Kano Pillars (Nigeria)
 *   2060 → AB Copenhagen (Denmark) · 4025 → Toronto II (Canada)
 *
 * ── VARFÖR EN GENERERAD TS-FIL, INTE EN TABELL ───────────────────────────
 * Samma val som `league-tier.ts` och `post-allsvenskan-level.ts` redan gör:
 * det är en långsam-föränderlig uppslagningstabell, inte händelsedata. Som
 * fil blir den versionshanterad, granskningsbar i en diff, kräver ingen
 * migration, och kostar noll databasfrågor i renderingen. Kör om skriptet
 * när nya klubbar dyker upp i transferdatan (skriptet skriver bara ut de
 * id:n som faktiskt förekommer).
 *
 * Körs med:  npx tsx scripts/import/build-club-country-map.ts
 */
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../../lib/supabase/paginate";

config({ path: ".env.local" });

const API_KEY = process.env.API_FOOTBALL_KEY!;
const OUT_FILE = "lib/football/club-country.ts";
const MIN_MS_BETWEEN_CALLS = 250;

interface TeamResponse {
  team: { id: number; name: string; country: string | null; national: boolean };
}

async function fetchTeam(id: number): Promise<TeamResponse["team"] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://v3.football.api-sports.io/teams?id=${id}`, {
      headers: { "x-apisports-key": API_KEY },
    });
    if (res.status === 429) {
      console.warn(`  429 för klubb ${id}, väntar 15s...`);
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    const json = (await res.json()) as { response?: TeamResponse[]; errors?: unknown };
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
      throw new Error(`api-football: ${JSON.stringify(json.errors)}`);
    }
    return json.response?.[0]?.team ?? null;
  }
  return null;
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Varje klubb-id som förekommer någonstans i vår transfer-/karriärdata.
  const transfers = await fetchAllRows<{ from_team_external_id: number | null; to_team_external_id: number | null }>((from, to) =>
    supabase.from("player_transfer_event").select("from_team_external_id, to_team_external_id").order("id").range(from, to)
  );
  const stints = await fetchAllRows<{ team_external_id: number | null }>((from, to) =>
    supabase.from("player_career_stint").select("team_external_id").order("id").range(from, to)
  );
  const { data: teams } = await supabase.from("team").select("external_id").not("external_id", "is", null);

  const ids = new Set<number>();
  for (const t of transfers) {
    if (t.from_team_external_id) ids.add(t.from_team_external_id);
    if (t.to_team_external_id) ids.add(t.to_team_external_id);
  }
  for (const s of stints) if (s.team_external_id) ids.add(s.team_external_id);
  for (const t of teams ?? []) if (t.external_id) ids.add(t.external_id as number);

  const sorted = [...ids].sort((a, b) => a - b);
  console.log(`${sorted.length} distinkta klubb-id att slå upp (~${Math.round((sorted.length * MIN_MS_BETWEEN_CALLS) / 60_000)} min)`);

  const rows: { id: number; name: string; country: string }[] = [];
  let missing = 0;
  for (const [index, id] of sorted.entries()) {
    const team = await fetchTeam(id);
    if (team?.country) rows.push({ id, name: team.name, country: team.country });
    else missing++;
    if ((index + 1) % 100 === 0) console.log(`  ${index + 1}/${sorted.length} (${rows.length} med land, ${missing} utan)`);
    await new Promise((r) => setTimeout(r, MIN_MS_BETWEEN_CALLS));
  }

  const byCountry = new Map<string, number>();
  for (const r of rows) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  const top = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const header = `/**
 * GENERERAD FIL — skriv inte i den för hand.
 * Byggd av scripts/import/build-club-country-map.ts (${new Date().toISOString().slice(0, 10)}) ur
 * api-footballs /teams?id=, som svarar med klubbens land direkt.
 *
 * Innehåller varje klubb-id som förekommer i player_transfer_event,
 * player_career_stint eller vår egen team-tabell — ${rows.length} klubbar med
 * verifierat land av ${sorted.length} uppslagna (${missing} saknade svar).
 * Vanligast: ${top.map(([c, n]) => `${c} ${n}`).join(", ")}.
 *
 * Används av lib/football/incoming-transfers.ts för att avgöra om en
 * avsändarklubb är svensk eller utländsk — se den filens huvud för varför
 * karriärstatistiken inte räckte som källa.
 *
 * Kör om skriptet när nya klubbar dykt upp i transferdatan.
 */
export const CLUB_COUNTRY: Record<number, string> = {
`;

  const body = rows.map((r) => `  ${r.id}: ${JSON.stringify(r.country)}, // ${r.name}`).join("\n");
  const footer = `
};

/** Klubbens land enligt api-football, eller null om klubben inte är uppslagen. */
export function getClubCountry(externalId: number | null | undefined): string | null {
  if (externalId == null) return null;
  return CLUB_COUNTRY[externalId] ?? null;
}
`;

  writeFileSync(OUT_FILE, header + body + footer, "utf8");
  console.log(`\nSkrev ${OUT_FILE}: ${rows.length} klubbar med land, ${missing} utan svar.`);
  console.log("Topp:", top.map(([c, n]) => `${c}=${n}`).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
