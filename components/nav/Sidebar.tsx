"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { strings } from "@/lib/i18n/sv";

const NAV_ITEMS = [
  { href: "/chat", label: "Chatta", icon: "💬" },
  { href: "/data/players", label: "Spelare", icon: "👤" },
  { href: "/data/teams", label: "Lag", icon: "🛡️" },
  { href: "/data/matches", label: "Matcher", icon: "⚽" },
] as const;

const DISABLED_ITEMS = [{ label: "Tabeller", icon: "🏆" }] as const;

/**
 * Fast vänsternav på desktop, en enkel horisontell topplist som fallback på
 * mobil. Ersätter både startsidans gamla enkla länkar och den tidigare
 * Data-sektionens egen header (app/data/layout.tsx, borttagen).
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: fast vänsterkolumn */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#1a1a19] px-3 py-5 sm:flex">
        <Link href="/" className="mb-6 px-2 text-sm font-semibold tracking-tight text-white">
          ⚽ {strings.app.name}
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-white/10 text-white" : "text-[#c3c2b7] hover:bg-white/5 hover:text-white"
                }`}
              >
                <span aria-hidden>{item.icon}</span> {item.label}
              </Link>
            );
          })}
          {DISABLED_ITEMS.map((item) => (
            <span
              key={item.label}
              title="Kommer snart"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#898781]/50"
            >
              <span aria-hidden>{item.icon}</span> {item.label}
            </span>
          ))}
        </nav>
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/settings"
              ? "bg-white/10 text-white"
              : "text-[#c3c2b7] hover:bg-white/5 hover:text-white"
          }`}
        >
          ⚙️ Inställningar
        </Link>
      </aside>

      {/* Mobil: horisontell topplist */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#1a1a19] px-2 py-2 sm:hidden">
        {[...NAV_ITEMS, { href: "/settings", label: "Inställningar", icon: "⚙️" }].map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-[#c3c2b7]"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
