import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface FavoriteTeam {
  id: number;
  name: string;
  logo_url: string | null;
  nicknames: string[];
}

/**
 * Profilraden plus favoritlaget. Laget följer med i SAMMA fråga eftersom
 * startsidan, inställningarna och onboardingen alla behövde det och alla tre
 * gjorde sin egen variant av precis den här joinen.
 */
export type Profile = ProfileRow & { favorite_team: FavoriteTeam | null };

/**
 * PRESTANDA (2026-08-23) — request-lokal dedupliceringen av auth.
 *
 * MÄTT PROBLEM: varje navigering gjorde samma auth-arbete tre gånger. På
 * startsidan t.ex.:
 *
 *   proxy.ts (middleware)   auth.getUser()              ~30–80ms
 *   app/(app)/layout.tsx    auth.getUser() + profiles   ~70–110ms
 *   app/(app)/page.tsx      auth.getUser() + profiles   ~70–110ms
 *
 * Det satte ett golv på ~150–300ms INNAN sidans egen data ens började
 * hämtas — på varje sida, och på varje prefetch Sidebar skickade. Det var
 * därför även en tom sida som /scout/shortlist låg på ~200ms.
 *
 * React `cache()` memoiserar per request (inte mellan requests, inte mellan
 * användare) — exakt rätt verktyg här: layouten och sidan under den delar
 * numera ETT anrop. Ingen ändrad semantik, ingen delad användardata.
 *
 * OBS: middleware körs i en separat invokation och kan inte dela cachen med
 * renderingen. Det anropet är kvar med flit — det är där Supabase-sessionen
 * faktiskt förnyas (se lib/supabase/middleware.ts).
 */

/**
 * Den verifierade inloggade identiteten. En gång per request.
 *
 * PRESTANDA (2026-08-23): använder `getClaims()`, som verifierar access-token
 * kryptografiskt mot projektets JWKS UTAN nätverksanrop (0–1ms med cachat
 * nyckelset, mot 36–41ms för `getUser()`). Se lib/supabase/middleware.ts:s
 * filhuvud för hela säkerhetsresonemanget och de verifieringar som gjordes
 * innan bytet — kortfattat: manipulerade och förfalskade tokens avvisas, och
 * utgångstiden valideras.
 *
 * Returtypen är avsiktligt SMAL — bara det som faktiskt är signerat och som
 * anroparna använder. Behöver man hela `User`-objektet (metadata, providers)
 * ska man göra ett uttryckligt `supabase.auth.getUser()`, så att kostnaden
 * syns där den tas.
 */
export interface CurrentUser {
  id: string;
  email: string | null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/**
 * Hela profilraden, en gång per request. Tidigare hämtade layouten `role`,
 * sidan `role, scout_access` och settings ytterligare kolumner — tre
 * separata frågor mot samma rad. Raden är liten (en handfull kolumner), så
 * det är billigare att hämta den hel en gång än att fråga tre gånger.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*, favorite_team:favorite_team_id(id, name, logo_url, nicknames)")
    .eq("id", user.id)
    .single<Profile>();
  return data ?? null;
});
