import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data-sektionen (steg "nästa stora spår", se PROJEKT_BRIEF.md-uppföljning).
 * Medvetet permanent mörkt tema (inte kopplat till systemets ljus/mörkt) —
 * ska kännas som ett fristående, premium analysverktyg, skilt från resten
 * av appens vanliga ljus/mörkt-anpassade sidor. Färgtoner från dataviz-
 * skillens validerade referenspalett (references/palette.md, dark-kolumnen).
 *
 * Rör INTE /chat eller / — helt separat yta, egen layout.
 */

const NAV_ITEMS = [
  { href: "/data/players", label: "Spelare", icon: "👤", available: true },
  { href: "/data/teams", label: "Lag", icon: "🛡️", available: true },
  { href: "/data/matches", label: "Matcher", icon: "⚽", available: true },
  { href: "#", label: "Historik", icon: "🏆", available: false },
];

export default async function DataLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-white/10 bg-[#1a1a19]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xs text-[#898781] hover:text-white">
              ← Startsida
            </Link>
            <span className="text-sm font-semibold tracking-tight">🤓 Data</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) =>
              item.available ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
                >
                  {item.icon} {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  title="Kommer snart"
                  className="rounded-full px-3 py-1.5 text-xs text-[#898781]/50"
                >
                  {item.icon} {item.label}
                </span>
              )
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
