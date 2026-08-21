import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Fas 14.1 — Scouts EGEN route-grupp/shell, medvetet skild från
 * app/(app)/layout.tsx:s Sidebar. Målet (se plans/humble-giggling-biscuit.md,
 * "Scout ska kännas som en egen produkt") är att användaren aldrig ser
 * Scout-undersidor bland Fotboll-menyns flikar — man klickar in i Scout via
 * ETT nav-objekt (violett accent, se components/nav/Sidebar.tsx) och är
 * sedan kvar i den här egna shellen.
 *
 * Samma inloggningskrav som (app) — Scout är tänkt som en betalprodukt, men
 * åtkomstspärren (Fas 14.5: en flagga på profiles, samma mönster som
 * profiles.role redan används för admin) finns INTE än. Fram tills dess är
 * Scout tillgängligt för alla inloggade, precis som resten av appen var
 * innan denna fas.
 *
 * Full egen navigation (Spelare/Lag/Search/Compare/Shortlist) byggs i
 * Fas 14.4 när de sidorna faktiskt finns — den här toppraden är medvetet
 * minimal tills dess (bara en tillbaka-länk + rubrik), inte en förtida
 * gissning om vad den fulla Scout-navigationen ska innehålla.
 */
export default async function ScoutLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#a78bfa]/20 bg-[#141117] px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/scout" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#a78bfa] text-xs font-bold text-[#a78bfa] shadow-[0_0_10px_-2px_rgba(167,139,250,0.65)]">
              S
            </span>
            <span className="text-sm font-bold tracking-wide text-white">SCOUT</span>
          </Link>
          <Link href="/" className="text-xs text-[#898781] hover:text-white">
            ⚽ Till Fotboll
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
