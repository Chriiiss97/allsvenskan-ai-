/**
 * PRESTANDA (2026-08-23) — parallell sidnumrerad hämtning.
 *
 * Supabase/PostgREST returnerar max 1000 rader per fråga (och trunkerar
 * TYST, utan att sätta `error` — fällan som redan är dokumenterad i
 * lib/football/post-allsvenskan.ts:s Fas 18g-kommentar). Lösningen har varit
 * en `for`-loop som hämtar sida efter sida i tur och ordning.
 *
 * Den loopen var mätbart dyr. Uppmätt mot den riktiga databasen:
 *
 *   player_career_stint    19 252 rader   20 round-trips i rad   1 241ms
 *   player_transfer_event  12 022 rader   13 round-trips i rad     549ms
 *   statistics              6 377 rader    7 round-trips i rad     651ms
 *   player                  2 305 rader    3 round-trips i rad     165ms
 *
 * Ingen av sidorna beror på någon annan — de väntade bara i kö. Den här
 * hjälparen hämtar dem i parallella omgångar istället, vilket tar bort
 * nästan hela väntetiden utan att ändra en enda rad i resultatet.
 *
 * VIKTIGT: den tar emot en FABRIK, inte en färdig query. En Supabase-
 * query-builder muterar sig själv när man anropar `.range()` och kan därför
 * inte återanvändas för flera samtidiga sidor — varje sida måste bygga sin
 * egen fråga.
 */

export interface PaginateOptions {
  /** Rader per fråga. PostgREST:s tak är 1000. */
  pageSize?: number;
  /** Hur många sidor som hämtas samtidigt. */
  concurrency?: number;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PageResult<T>,
  options: PaginateOptions = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const concurrency = options.concurrency ?? 8;

  const rows: T[] = [];
  let offset = 0;

  for (;;) {
    const batch = Array.from({ length: concurrency }, (_, i) => {
      const from = offset + i * pageSize;
      return buildPage(from, from + pageSize - 1);
    });

    const results = await Promise.all(batch);

    let reachedEnd = false;
    for (const { data, error } of results) {
      if (error) throw error;
      const page = data ?? [];
      // Sidorna läggs på i ordning; en kort sida betyder att tabellen tog
      // slut där, och allt efter den i omgången är garanterat tomt.
      if (!reachedEnd) rows.push(...page);
      if (page.length < pageSize) reachedEnd = true;
    }

    if (reachedEnd) return rows;
    offset += concurrency * pageSize;
  }
}
