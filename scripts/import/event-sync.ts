import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { ApiEventResponse } from "../../lib/api-football/types";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 20 (2026-08-23) — delad, AVSTÄMMANDE skrivning av en matchs händelser.
 *
 * Både live-pipeline.ts och import-events.ts skrev tidigare varje händelse
 * med samma naiva `upsert(..., { onConflict: "fixture_id,player_id,minute,
 * type,detail" })`. Det ser rätt ut, men Postgres räknar NULL som SKILT från
 * NULL i ett unikt index — en händelse där källan inte gav något spelar-id
 * (eller där spelaren inte finns i vår `player`-tabell) träffar därför
 * ALDRIG konflikten, utan infogas på nytt vid varje körning.
 *
 * Mätt på riktig data (match #3457, Örgryte–Halmstad 2026-08-22) innan
 * fixen — två separata fel samtidigt:
 *   - id 34596 (14:42, live-tick) och id 34620 (15:42, finalize) är SAMMA
 *     gula kort i minut 77. Ren dubblett.
 *   - id 34580 är ett gult kort i minut 34 utan spelare, sparat av den
 *     första live-ticken. API:t fyllde senare i spelarna (id 8016 och 1386,
 *     sparade som egna rader) — men nollraden städades aldrig bort, så
 *     matchen visar tre gula kort i minut 34 där det bara fanns två.
 *
 * Med fyra ticks per match var det irriterande. Med ~30 sekunders polling
 * (Fas 20:s hela poäng) hade det blivit 100+ skräprader per match, så det
 * här är en förutsättning för kadenshöjningen, inte en sidofix.
 *
 * Lösningen: /fixtures/events returnerar ALLTID matchens fullständiga
 * händelselista, inte ett tillägg sedan förra gången. Den är alltså
 * facit — vi stämmer av mot den istället för att blint lägga till:
 *
 *   1. Händelser MED spelar-id: samma upsert som förut. Det unika indexet
 *      fungerar som avsett så fort player_id inte är null.
 *   2. Händelser UTAN spelar-id: räknas per "naturlig signatur" (lag +
 *      minut + tilläggsminut + typ + detalj). API:t säger hur många sådana
 *      som ska finnas; vi infogar bara det som fattas och tar bort det som
 *      blivit över. Det läker BÅDA felen ovan — dubbletten försvinner, och
 *      nollraden i minut 34 tas bort så fort API:t rapporterat samma kort
 *      med en riktig spelare.
 *
 * Varför signaturen INTE räcker som identitet på egen hand: minut 34 i
 * samma match hade två EKTA gula kort för samma lag (spelare 8016 och
 * 1386). Att slå ihop på signatur hade tappat ett av dem. Därför matchas
 * spelarförsedda händelser fortsatt på spelar-id, och signaturen används
 * bara för att räkna hur många ANONYMA rader som ska finnas kvar.
 *
 * Radering: rör bara `event`-rader för EN fixture som saknar player_id och
 * som källan inte längre rapporterar. En rad med kopplad spelare kan aldrig
 * raderas här. Dessutom hoppas avstämningen helt över om API-svaret var
 * tomt — ett tillfälligt tomt/trasigt svar ska aldrig kunna tömma en
 * redan sparad tidslinje.
 */

export interface EventRowInput {
  fixture_id: number;
  team_id: number;
  player_id: number | null;
  assist_player_id: number | null;
  type: string;
  detail: string | null;
  comments: string | null;
  minute: number;
  extra_minute: number | null;
}

/** Naturlig identitet för en händelse utan spelare — allt utom vem den gäller. */
function signature(row: { team_id: number | null; minute: number | null; extra_minute: number | null; type: string; detail: string | null }): string {
  return [row.team_id ?? "", row.minute ?? "", row.extra_minute ?? "", row.type, row.detail ?? ""].join("|");
}

/** Översätter ett rått /fixtures/events-svar till våra radformer. */
export async function buildEventRows(
  fixtureId: number,
  events: ApiEventResponse[],
  resolve: { team: (t: ApiEventResponse["team"]) => Promise<number>; player: (id: number | null) => Promise<number | null> }
): Promise<EventRowInput[]> {
  const rows: EventRowInput[] = [];
  for (const e of events) {
    rows.push({
      fixture_id: fixtureId,
      team_id: await resolve.team(e.team),
      player_id: await resolve.player(e.player.id),
      assist_player_id: await resolve.player(e.assist.id),
      type: e.type.toLowerCase(),
      detail: e.detail,
      comments: e.comments,
      minute: e.time.elapsed,
      extra_minute: e.time.extra,
    });
  }
  return rows;
}

/**
 * Skriver matchens händelser avstämt mot källan. Returnerar vad som faktiskt
 * ändrades, så anropande pipeline kan logga något sannare än antal rader i
 * svaret.
 */
export async function syncFixtureEvents(
  supabase: Supabase,
  fixtureId: number,
  rows: EventRowInput[]
): Promise<{ upserted: number; inserted: number; removed: number }> {
  // Tomt svar = ingen avstämning alls (se filhuvudet). Aldrig en tömning.
  if (rows.length === 0) return { upserted: 0, inserted: 0, removed: 0 };

  const withPlayer = rows.filter((r) => r.player_id !== null);
  for (const row of withPlayer) {
    const { error } = await supabase.from("event").upsert(row, { onConflict: "fixture_id,player_id,minute,type,detail" });
    if (error) throw error;
  }

  const wantedAnonymous = new Map<string, EventRowInput[]>();
  for (const row of rows) {
    if (row.player_id !== null) continue;
    const key = signature(row);
    const list = wantedAnonymous.get(key) ?? [];
    list.push(row);
    wantedAnonymous.set(key, list);
  }

  const { data: existing, error: existingError } = await supabase
    .from("event")
    .select("id, team_id, player_id, type, detail, minute, extra_minute")
    .eq("fixture_id", fixtureId)
    .is("player_id", null)
    .returns<{ id: number; team_id: number | null; player_id: number | null; type: string; detail: string | null; minute: number | null; extra_minute: number | null }[]>();
  if (existingError) throw existingError;

  const existingAnonymous = new Map<string, number[]>();
  for (const row of existing ?? []) {
    const key = signature(row);
    const list = existingAnonymous.get(key) ?? [];
    list.push(row.id);
    existingAnonymous.set(key, list);
  }

  let inserted = 0;
  for (const [key, wanted] of wantedAnonymous) {
    const have = existingAnonymous.get(key) ?? [];
    const missing = wanted.slice(have.length);
    if (missing.length === 0) continue;
    const { error } = await supabase.from("event").insert(missing);
    if (error) throw error;
    inserted += missing.length;
  }

  const excessIds: number[] = [];
  for (const [key, have] of existingAnonymous) {
    const wantedCount = wantedAnonymous.get(key)?.length ?? 0;
    excessIds.push(...have.slice(wantedCount));
  }
  if (excessIds.length > 0) {
    const { error } = await supabase.from("event").delete().in("id", excessIds);
    if (error) throw error;
  }

  return { upserted: withPlayer.length, inserted, removed: excessIds.length };
}
