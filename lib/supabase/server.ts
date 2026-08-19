import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Supabase-klient för användning i Server Components, Server Actions och
 * Route Handlers. Läser/skriver auth-sessionen via Next.js cookies().
 *
 * Använder fortfarande anon-nyckeln (inte service role) — RLS gäller.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll anropades från en Server Component. Det går att ignorera
            // om middleware.ts uppdaterar sessionen åt oss (se lib/supabase/middleware.ts).
          }
        },
      },
    }
  );
}
