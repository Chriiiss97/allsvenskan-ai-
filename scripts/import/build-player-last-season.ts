/**
 * Fas 22c (2026-08-23, användarkrav) — bygger `lib/football/player-last-season.ts`:
 * sista säsongen varje spelare är REGISTRERAD i api-football, oavsett liga.
 *
 * ── VARFÖR DEN BEHÖVS ────────────────────────────────────────────────────
 * Frågan är "har spelaren avslutat sin karriär?". Ingen av våra källor har
 * en pensionsflagga (Sportmonks spelarobjekt saknar fältet helt; deras
 * `career_ended` på transferrader finns bara för en delmängd och Wernbloom
 * har noll transferrader där). Det närmaste som finns är FRÅNVARO — och för
 * att frånvaro ska betyda något måste den mätas mot en källa som ser ALLA
 * ligor, inte bara de vi importerar.
 *
 * Vår egen data räcker alltså inte. Mätning 2026-08-23: en regel byggd bara
 * på `statistics` + `player_career_stint` + transferhistorik flaggade 669 av
 * 2 305 spelare som avslutade — och stickprov visade att minst hälften av de
 * unga bland dem fortfarande spelade (Oliver Dovin, Casper Widell, Pontus
 * Kindberg, Agon Muçolli, Thomas Rogne ...). De hade bara gått till klubbar
 * vars ligor vi inte importerar. api-footballs `/players/seasons?player=X`
 * ser dem, och svarar med hela registreringshistoriken: Wernbloom 2005–2021,
 * punkt slut.
 *
 * ── VARFÖR EN GENERERAD FIL ──────────────────────────────────────────────
 * Samma resonemang som `club-country.ts`. Skillnaden är att det HÄR blir
 * inaktuellt med tiden — därför läses filen aldrig ensam: runtime tar
 * `max(vår egen färska data, den här filen)`, se player-activity.ts. En
 * gammal fil kan alltså bara göra oss FÖRSIKTIGARE (någon flaggas inte som
 * avslutad), aldrig få oss att kalla en aktiv spelare pensionerad.
 *
 * Kör om skriptet efter varje säsong, eller när listan känns gammal:
 *   npx tsx scripts/import/build-player-last-season.ts
 */
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../../lib/supabase/paginate";

config({ path: ".env.local" });

const API_KEY = process.env.API_FOOTBALL_KEY!;
const OUT_FILE = "lib/football/player-last-season.ts";
const MIN_MS_BETWEEN_CALLS = 250;

async function fetchSeasons(externalId: number): Promise<number[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://v3.football.api-sports.io/players/seasons?player=${externalId}`, {
      headers: { "x-apisports-key": API_KEY },
    });
    if (res.status === 429) {
      console.warn(`  429 för spelare ${externalId}, väntar 15s...`);
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    const json = (await res.json()) as { response?: unknown[]; errors?: unknown };
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
      throw new Error(`api-football: ${JSON.stringify(json.errors)}`);
    }
    return (json.response ?? []).filter((x): x is number => typeof x === "number");
  }
  return [];
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const players = await fetchAllRows<{ id: number; external_id: number | null; full_name: string }>((from, to) =>
    supabase.from("player").select("id, external_id, full_name").not("external_id", "is", null).order("id").range(from, to)
  );

  console.log(`${players.length} spelare att slå upp (~${Math.round((players.length * MIN_MS_BETWEEN_CALLS) / 60_000)} min)`);

  const rows: { externalId: number; lastSeason: number; name: string }[] = [];
  let empty = 0;
  for (const [index, player] of players.entries()) {
    const seasons = await fetchSeasons(player.external_id!);
    if (seasons.length > 0) rows.push({ externalId: player.external_id!, lastSeason: Math.max(...seasons), name: player.full_name });
    else empty++;
    if ((index + 1) % 200 === 0) console.log(`  ${index + 1}/${players.length} (${rows.length} med säsonger, ${empty} utan)`);
    await new Promise((r) => setTimeout(r, MIN_MS_BETWEEN_CALLS));
  }

  rows.sort((a, b) => a.externalId - b.externalId);
  const byYear = new Map<number, number>();
  for (const r of rows) byYear.set(r.lastSeason, (byYear.get(r.lastSeason) ?? 0) + 1);
  const spread = [...byYear.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);

  const header = `/**
 * GENERERAD FIL — skriv inte i den för hand.
 * Byggd av scripts/import/build-player-last-season.ts (${new Date().toISOString().slice(0, 10)}) ur
 * api-footballs /players/seasons, som listar varje säsong en spelare varit
 * registrerad — i VILKEN liga som helst, inte bara de vi importerar.
 *
 * ${rows.length} spelare med minst en registrerad säsong (${empty} utan svar).
 * Sista säsong, senaste åren: ${spread.map(([y, n]) => `${y}: ${n}`).join(", ")}.
 *
 * Nyckeln är api-footballs SPELAR-ID (player.external_id), inte vårt eget id.
 * Läses av lib/football/player-activity.ts, som alltid kombinerar den med vår
 * egen färska data — se den filens huvud för varför en gammal fil bara kan
 * göra oss försiktigare, aldrig fel.
 */
export const PLAYER_LAST_SEASON: Record<number, number> = {
`;
  const body = rows.map((r) => `  ${r.externalId}: ${r.lastSeason}, // ${r.name}`).join("\n");
  const footer = `
};

/** Sista säsongen spelaren var registrerad enligt api-football, eller null. */
export function getRegisteredThroughSeason(externalId: number | null | undefined): number | null {
  if (externalId == null) return null;
  return PLAYER_LAST_SEASON[externalId] ?? null;
}
`;

  writeFileSync(OUT_FILE, header + body + footer, "utf8");
  console.log(`\nSkrev ${OUT_FILE}: ${rows.length} spelare, ${empty} utan säsongsdata.`);
  console.log("Sista säsong:", spread.map(([y, n]) => `${y}=${n}`).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
