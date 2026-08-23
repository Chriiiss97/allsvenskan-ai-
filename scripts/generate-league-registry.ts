/**
 * Genererar lib/ovr/league-registry.ts ur den FAKTISKA datan.
 *
 * Bakgrund: tre av de tolv uteslutna cup-id:na i den första versionen av
 * config.ts var gissade ur en inventeringsutskrift som visade antal, inte id.
 * Två av dem pekade på riktiga ligor (290 = Persian Gulf Pro League,
 * 169 = Super League), som därmed uteslöts av misstag.
 *
 * Lösningen är att aldrig skriva ett liga-id för hand igen. Registret nedan
 * genereras ur player_career_stint, checkas in, och ett permanent test
 * (league-registry.test.ts) verifierar att varje id i config.ts matchar
 * registrets namn. Gissar någon fel i framtiden faller testet.
 *
 *   npx tsx scripts/generate-league-registry.ts
 */

import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { createAdminClient } from "./import/admin-client";

interface Row {
  league_external_id: number;
  league_name: string;
  league_country: string | null;
  minutes_played: number | null;
}

/**
 * Turneringsformer som aldrig får bidra till ett betyg, oavsett koefficient.
 *
 * Cuper blandar divisioner i samma tabell — en allsvensk klubb möter ett
 * division 3-lag. Träningsmatcher är inte tävlingsspel alls. Supercupen är en
 * enstaka match. Reserv- och ungdomsserier mäter en annan population.
 */
function classify(name: string): "cup" | "friendly" | "youth" | "league" {
  const n = name.toLowerCase();
  if (/friendl|pre-?season|test match/.test(n)) return "friendly";
  if (/\bu1[5-9]\b|\bu2[0-3]\b|youth|junior|reserve|academy|primavera/.test(n)) return "youth";
  if (
    /\bcup\b|cupen|\bpokal|pokalen|copa|coppa|beker|kupa|kupası|kypello|\btrophy\b|trophée|taça|puchar|karikaobs|\bcupa\b|\bkupa\b/.test(
      n
    )
  ) {
    return "cup";
  }
  return "league";
}

async function main(): Promise<void> {
  const supabase = createAdminClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_career_stint")
      .select("league_external_id, league_name, league_country, minutes_played")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  const byId = new Map<number, { name: string; country: string | null; minutes: number; stints: number }>();
  for (const r of rows) {
    const e = byId.get(r.league_external_id) ?? { name: r.league_name, country: r.league_country, minutes: 0, stints: 0 };
    e.minutes += r.minutes_played ?? 0;
    e.stints += 1;
    // Namnet kan variera marginellt mellan rader — behåll det första, men
    // föredra ett med land ifyllt.
    if (!e.country && r.league_country) e.country = r.league_country;
    byId.set(r.league_external_id, e);
  }

  const entries = [...byId.entries()].sort((a, b) => a[0] - b[0]);
  const counts = { league: 0, cup: 0, friendly: 0, youth: 0 };

  const lines: string[] = [];
  for (const [id, e] of entries) {
    const kind = classify(e.name);
    counts[kind]++;
    const country = e.country === null ? "null" : JSON.stringify(e.country);
    lines.push(
      `  { id: ${id}, name: ${JSON.stringify(e.name)}, country: ${country}, kind: ${JSON.stringify(kind)}, minutes: ${e.minutes} },`
    );
  }

  const file = `/**
 * LIGAREGISTER — GENERERAD FIL, REDIGERA INTE FÖR HAND.
 * =============================================================================
 * Genererad av scripts/generate-league-registry.ts ur den faktiska datan i
 * player_career_stint. Kör om scriptet när nya ligor dyker upp i importen.
 *
 * Registret finns för att inget liga-id någonsin ska skrivas för hand igen.
 * I den första versionen av config.ts var tre av tolv uteslutna cup-id gissade,
 * och två av dem pekade i själva verket på riktiga ligor (290 = Persian Gulf
 * Pro League, 169 = Super League) som därmed uteslöts av misstag.
 * league-registry.test.ts verifierar att varje id i config.ts matchar namnet
 * här, så samma sorts gissning inte kan smyga sig in igen.
 *
 * kind:
 *   "league"   — seriespel, kan få en koefficient
 *   "cup"      — blandar divisioner i samma tabell, aldrig med i ett betyg
 *   "friendly" — träningsmatcher, inte tävlingsspel
 *   "youth"    — ungdoms- och reservserier, en annan population
 *
 * Genererad ${new Date().toISOString().slice(0, 10)} ur ${rows.length} karriärposter:
 * ${counts.league} serier, ${counts.cup} cuper, ${counts.friendly} träningsmatchsformer, ${counts.youth} ungdomsserier.
 */

export interface LeagueRegistryEntry {
  id: number;
  name: string;
  country: string | null;
  kind: "league" | "cup" | "friendly" | "youth";
  /** Totala minuter i vår data — visar vilka poster som faktiskt betyder något. */
  minutes: number;
}

export const LEAGUE_REGISTRY: readonly LeagueRegistryEntry[] = [
${lines.join("\n")}
];

const BY_ID = new Map(LEAGUE_REGISTRY.map((l) => [l.id, l]));

export function lookupLeague(id: number): LeagueRegistryEntry | undefined {
  return BY_ID.get(id);
}

/** Turneringar som aldrig får bidra till ett betyg, oavsett koefficient. */
export function isCompetitiveLeague(id: number): boolean {
  return BY_ID.get(id)?.kind === "league";
}
`;

  fs.writeFileSync("lib/ovr/league-registry.ts", file);
  console.log(`Skrev lib/ovr/league-registry.ts — ${entries.length} ligor.`);
  console.log(`  serier ${counts.league} · cuper ${counts.cup} · träningsmatcher ${counts.friendly} · ungdom ${counts.youth}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
