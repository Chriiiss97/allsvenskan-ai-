"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  label: string;
  href: string;
}

/**
 * Liten segmented control för att växla mellan två lägen inom en
 * Data-undersektion (Spelare/Jämför spelare, Ett lag/Lag vs lag) — andra
 * navigationsnivån under Sidebar.tsx:s toppnivå-länkar. Samma mörka
 * tokens/aktiv-state-språk som resten av appen.
 */
export function SectionTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <div className="mb-6 inline-flex gap-1 rounded-full border border-white/10 bg-[#141418] p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-[#3987e5]/15 text-white" : "text-[#c3c2b7] hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
