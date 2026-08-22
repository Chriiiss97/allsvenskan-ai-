"use client";

// TILLFÄLLIG inloggningssida — bara för manuell testning under byggfasen,
// tills Google-inloggningen är kopplad in på riktigt (den är redan kodad,
// se components/auth/LoginButton.tsx — bara aldrig testad mot en riktig
// deploy). Ta bort filen helt när det är verifierat.
//
// SÄKERHETSSPÄRR (2026-08-20, inför första Vercel-deployen): den här sidan
// loggar in som test@allsvenskan.local — ett konto uppgraderat till admin
// med obegränsad kvot. Utan spärr skulle VEM SOM HELST kunna gå till
// /dev-login på en publik deploy och logga in som admin. next build sätter
// process.env.NODE_ENV till "production" (inlinead vid bygget, samma värde
// i både server- och klientkod) — 404:ar därför bort sidan helt i en
// produktionsbuild, oavsett Vercel-plan. Fungerar fortfarande i `next dev`.
import { useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DevLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("test@allsvenskan.local");
  const [password, setPassword] = useState("Testa123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-full max-w-sm rounded-xl border border-black/10 p-6 text-left dark:border-white/15">
        <h1 className="text-lg font-semibold">Test-inloggning</h1>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Tillfällig — ersätts av riktig Google-inlogg senare. Fälten är redan ifyllda, klicka bara
          Logga in.
        </p>
        <form onSubmit={handleLogin} className="mt-4 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="text-xs text-black/40 dark:text-white/40">
        <p>Genvägar när du är inloggad:</p>
        <p className="mt-1 space-x-2">
          <Link href="/" className="underline">Startsida</Link>
          <Link href="/chat" className="underline">Chat</Link>
          <Link href="/spelare" className="underline">Data</Link>
        </p>
      </div>
    </div>
  );
}
