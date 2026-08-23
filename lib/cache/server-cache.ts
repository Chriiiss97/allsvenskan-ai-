import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * PRESTANDA (2026-08-23) — delat serverside-cachelager för all PUBLIK
 * fotbollsdata.
 *
 * BAKGRUND (uppmätt, inte gissat). Före den här filen gjorde varje
 * sidnavigering om hela sitt dataarbete från noll, varje gång:
 *
 *   Sida                 pass 1     pass 2     pass 3    svarsstorlek
 *   Efter Allsvenskan   11 274ms   10 968ms   12 795ms      6 039 kB
 *   Matcher              1 618ms    1 402ms    1 523ms        648 kB
 *   Scout sök            1 638ms    1 648ms    2 108ms         42 kB
 *   Spelare                648ms      467ms      462ms        288 kB
 *
 * Att pass 2 och 3 är precis lika långsamma som pass 1 ÄR fyndet: det fanns
 * ingen cache alls på de här vägarna. Sidebar:ns Link-prefetch gör dessutom
 * att flera av dem körs SAMTIDIGT vid varje navigering, så de konkurrerar
 * om samma databas.
 *
 * TVÅ LAGER, med avsikt:
 *
 *  1. `unstable_cache` — Next.js egna datacache. Rätt API för DEN HÄR appen
 *     (`cacheComponents` är inte påslaget i next.config.ts, så `use cache`-
 *     direktivet finns inte att tillgå; verifierat mot
 *     node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 *     unstable_cache.md enligt AGENTS.md:s regel). Överlever mellan
 *     requests OCH mellan serverinstanser i produktion.
 *
 *  2. Ett minneslager (Map + TTL) OVANPÅ. Anledningen är dokumenterad och
 *     uppmätt sedan tidigare i lib/football/player-card-data.ts: `next dev`
 *     KRINGGÅR medvetet Next:s datacache så att man alltid ser färsk data
 *     under utveckling — `unstable_cache` ensamt hjälper alltså aldrig på
 *     localhost, som är precis där segheten upplevs. Minneslagret är vanligt
 *     JS-modultillstånd och fungerar därför identiskt i dev och produktion.
 *
 * Minneslagret cachar SJÄLVA PROMISEN, inte det färdiga värdet. Det är inte
 * en detalj: när Sidebar prefetchar åtta sidor samtidigt skulle ett
 * värdebaserat cache låta alla åtta missa och starta var sin identisk
 * databasfråga (cache stampede). Nu väntar de sju senare på den första.
 *
 * SÄKERHET: bara data som ALLA inloggade får se cachas här — samma
 * avgränsning som player-card-data.ts redan följer. Tabellerna som läses har
 * `for select using (true)` (publik läsning, se DATABASE.md). Användarnära
 * data (profil, bevakningslista, kvot, admin) cachas ALDRIG via den här
 * filen utan frågas som förut med den request-bundna klienten.
 */

/**
 * Egen, KAKFRI Supabase-klient. En cachad funktion får inte läsa dynamiska
 * API:er som cookies()/headers() (se unstable_cache-dokumentationen), och
 * lib/supabase/server.ts-klienten hämtar sin auth-kontext från just cookies.
 * Helt korrekt här eftersom allt som läses är publik läsdata.
 */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface MemoryEntry {
  promise: Promise<unknown>;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

/** Standard-TTL. Datan ändras bara av importkörningar (cron/manuella scripts), aldrig av en sidladdning. */
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_REVALIDATE_S = 300;

/**
 * Taket finns bara för att en långlivad serverprocess inte ska växa
 * obegränsat om nyckelrymden är stor (t.ex. en cachad funktion med
 * spelar-id som argument). Äldst utgångstid vräks först.
 */
const MAX_ENTRIES = 200;

function evictIfNeeded() {
  if (memory.size <= MAX_ENTRIES) return;
  const byExpiry = [...memory.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (const [key] of byExpiry.slice(0, memory.size - MAX_ENTRIES)) {
    memory.delete(key);
  }
}

export interface CachedReadOptions {
  /** Minneslagrets livslängd. Default 5 min. */
  ttlMs?: number;
  /** Next.js-datacachens livslängd i sekunder. Default 300. */
  revalidate?: number;
  /** Taggar för revalidateTag(), t.ex. efter en importkörning. */
  tags?: string[];
}

/**
 * Gör en dyr, ren läsfunktion cachad. Funktionen måste vara SJÄLVFÖRSÖRJANDE
 * (skapa sin egen klient via createAnonClient) — den får inte ta emot en
 * request-bunden klient, eftersom en sådan varken går att använda inuti
 * unstable_cache eller är meningsfull att dela mellan requests.
 *
 * Argumenten måste vara JSON-serialiserbara; de ingår i cache-nyckeln, så
 * två olika argumentuppsättningar får alltid varsin post.
 *
 * ⚠️ Returvärdet serialiseras av unstable_cache. Returnera aldrig en Map,
 * ett Set eller en Date som anroparen förväntar sig få tillbaka med sin
 * prototyp i behåll — samma fälla som redan kraschat den här appen en gång
 * (se player-card-data.ts:s kommentar om `results.get is not a function`).
 * Returnera vanliga objekt/arrayer.
 */
export function cachedRead<Args extends unknown[], T>(
  key: string,
  fn: (...args: Args) => Promise<T>,
  options: CachedReadOptions = {}
): (...args: Args) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const revalidate = options.revalidate ?? DEFAULT_REVALIDATE_S;

  const persistent = unstable_cache(fn, [key], {
    revalidate,
    tags: options.tags ?? [key],
  });

  return (...args: Args): Promise<T> => {
    const cacheKey = `${key}:${JSON.stringify(args)}`;
    const now = Date.now();
    const hit = memory.get(cacheKey);
    if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

    const promise = persistent(...args);
    // Ett fel får aldrig ligga kvar och serveras i fem minuter — posten
    // plockas bort igen så nästa besökare gör ett riktigt försök.
    promise.catch(() => {
      if (memory.get(cacheKey)?.promise === promise) memory.delete(cacheKey);
    });

    memory.set(cacheKey, { promise, expiresAt: now + ttlMs });
    evictIfNeeded();
    return promise;
  };
}

/** Tömmer minneslagret. Finns för importskript/admin-vägar som vill se sin egen skrivning direkt. */
export function clearMemoryCache() {
  memory.clear();
}
