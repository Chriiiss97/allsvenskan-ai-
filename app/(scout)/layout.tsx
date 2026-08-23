import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";
import { PremiumGate } from "@/components/scout/PremiumGate";
import { hasScoutAccess } from "@/lib/auth/premium";

// Fas 18 (användarfeedback: "kom ihåg bara svenska") — samma hårda regel
// som PROJEKT_BRIEF.md:s "Språk"-avsnitt: inga engelska ord i UI:t, inte
// heller i nav-etiketter.
const SCOUT_NAV = [
  { href: "/scout/spelare", label: "Spelare" },
  { href: "/scout/lag", label: "Lag" },
  // Fas 22 (2026-08-23, användarkrav) — de två transferanalyserna delar EN
  // nav-post: "Värvningar". Riktningen (in i/ut ur Allsvenskan) väljs på
  // sidan via TransferDirectionTabs, inte i navet — annars konkurrerar två
  // nästan identiska etiketter om samma plats.
  { href: "/scout/varvningar", label: "Värvningar" },
  { href: "/scout/search", label: "Sök" },
  { href: "/scout/compare", label: "Jämför" },
  { href: "/scout/shortlist", label: "Bevakningslista" },
];

/**
 * Fas 14.1/14.4 — Scouts EGEN route-grupp/shell, medvetet skild från
 * app/(app)/layout.tsx:s Sidebar. Målet (se plans/humble-giggling-biscuit.md,
 * "Scout ska kännas som en egen produkt") är att användaren aldrig ser
 * Scout-undersidor bland Fotboll-menyns flikar — man klickar in i Scout via
 * ETT nav-objekt (violett accent, se components/nav/Sidebar.tsx) och är
 * sedan kvar i den här egna shellen med sin EGEN sub-navigation
 * (Spelare/Lag/Search/Compare/Shortlist), byggd i Fas 14.4 nu när alla fem
 * sidorna faktiskt finns.
 *
 * Samma inloggningskrav som (app). Fas 14.5: premium-gating via
 * PremiumGate — profiles.scout_access (satt manuellt av admin, ingen
 * riktig betalning än) ELLER role="admin". En spärrad användare ser ändå
 * hela Scout-shellen (nav, hubb-kort) — bara children blurras/overlayas av
 * PremiumGate, inte hela sidan dold.
 */
export default async function ScoutLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  const hasAccess = hasScoutAccess(profile);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#a78bfa]/20 bg-[#141117]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/scout" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#a78bfa] text-xs font-bold text-[#a78bfa] shadow-[0_0_10px_-2px_rgba(167,139,250,0.65)]">
              S
            </span>
            <span className="text-sm font-bold tracking-wide text-white">SCOUT</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-[#3987e5]/40 hover:text-[#3987e5]"
          >
            ⚽ Till Fotboll
          </Link>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {SCOUT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-[#c3c2b7] transition-colors hover:bg-[#a78bfa]/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <PremiumGate hasAccess={hasAccess}>{children}</PremiumGate>
      </main>
    </div>
  );
}
