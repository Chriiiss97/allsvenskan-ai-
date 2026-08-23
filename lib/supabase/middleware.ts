import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Uppdaterar (refreshar) Supabase auth-sessionen på varje request.
 * Anropas från proxy.ts (Next.js proxy/middleware-convention). Håll ingen egen
 * logik mellan createServerClient(...) och auth-anropet — se Supabase
 * SSR-dokumentationen.
 *
 * PRESTANDA (2026-08-23) — `getClaims()` istället för `getUser()`.
 *
 * `getUser()` gör ALLTID ett nätverksanrop till Supabase Auth. Uppmätt här:
 * 36–41ms, på VARJE request (middleware matchar allt utom statiska filer), och
 * renderingen gjorde sedan ett andra. Det var appens största fasta kostnad per
 * navigering efter cachningen — och på Vercel blir den värre om funktionens
 * region inte ligger nära Supabase.
 *
 * `getClaims()` verifierar access-token LOKALT mot projektets publicerade
 * JWKS. Uppmätt: 44ms första gången (hämtar nyckelsetet), därefter 0–1ms.
 *
 * Detta är INTE samma sak som det osäkra `getSession()` som Supabase-
 * dokumentationen varnar för. Verifierat mot den här databasen innan bytet:
 *   - projektet signerar med ES256 (asymmetriskt), JWKS svarar 200
 *   - manipulerad signatur      -> avvisad ("Invalid JWT signature")
 *   - token med utbytt user-id  -> avvisad ("Invalid JWT signature")
 *   - skräptoken                -> avvisad
 *   - utgången token            -> avvisad (`exp` valideras)
 * Skulle projektet någon gång byta tillbaka till en symmetrisk (HS*) nyckel
 * faller auth-js automatiskt tillbaka på `getUser()` — se GoTrueClient.ts.
 *
 * Anropet sker UTAN jwt-argument, och det är avgörande: då går getClaims via
 * `getSession()`, vilket är det som faktiskt förnyar en utgången session och
 * skriver de nya kakorna. Skickar man in token själv hoppas den vägen över och
 * sessionen slutar förnyas.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();

  return { supabaseResponse, userId: data?.claims.sub ?? null };
}
