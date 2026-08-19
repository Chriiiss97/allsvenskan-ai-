"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

// Enkla outline-ikoner (samma stil som Heroicons "outline") byggda som
// inline SVG istället för emoji — matchar den nördigare, mer professionella
// känslan vi siktar på i resten av appen. currentColor gör att de ärver
// textfärgen (aktiv/inaktiv-state) utan extra klasser.
function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

const ChatIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <path d="M4 7a3 3 0 013-3h10a3 3 0 013 3v6a3 3 0 01-3 3h-6l-4 3v-3H7a3 3 0 01-3-3V7z" />
    <circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);
const PlayerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <circle cx="12" cy="8" r="3.3" />
    <path d="M5 20c0-4.2 3.1-6.5 7-6.5s7 2.3 7 6.5" />
  </svg>
);
const TeamIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <path d="M12 3l7 3v5.5c0 4.8-3.2 7.7-7 8.8-3.8-1.1-7-4-7-8.8V6l7-3z" />
  </svg>
);
const MatchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 7.8l3 2.1-1.1 3.5h-3.8L9 9.9l3-2.1z" />
    <path d="M12 7.8V4.3M9.1 13.4l-3.7 1.8M14.9 13.4l3.7 1.8M10 10.3L6.4 8.3M14 10.3l3.6-2" />
  </svg>
);
const StandingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <path d="M7.5 4h9v3.8a4.5 4.5 0 01-9 0V4z" />
    <path d="M7.5 5.2H4.8v1.6a3.6 3.6 0 003.4 3.6M16.5 5.2h2.7v1.6a3.6 3.6 0 01-3.4 3.6" />
    <path d="M12 13v3M9 20h6M9.6 17h4.8" />
  </svg>
);
const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M19.4 12a7.3 7.3 0 01-.1 1.2l1.9 1.5-1.5 2.6-2.2-.8a7.4 7.4 0 01-2 1.2L15 20h-3l-.5-2.3a7.4 7.4 0 01-2-1.2l-2.2.8-1.5-2.6 1.9-1.5a7.3 7.3 0 010-2.4L5.8 9.3l1.5-2.6 2.2.8a7.4 7.4 0 012-1.2L12 4h3l.5 2.3a7.4 7.4 0 012 1.2l2.2-.8 1.5 2.6-1.9 1.5c.07.4.1.8.1 1.2z" />
  </svg>
);

const NAV_ITEMS = [
  { href: "/chat", label: "Chatta", icon: ChatIcon },
  { href: "/data/players", label: "Spelare", icon: PlayerIcon },
  { href: "/data/teams", label: "Lag", icon: TeamIcon },
  { href: "/data/matches", label: "Matcher", icon: MatchIcon },
] as const;

const DISABLED_ITEMS = [{ label: "Tabeller", icon: StandingsIcon }] as const;

/**
 * Fast vänsternav på desktop, en enkel horisontell topplist som fallback på
 * mobil. Ersätter både startsidans gamla enkla länkar och den tidigare
 * Data-sektionens egen header (app/data/layout.tsx, borttagen).
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: fast vänsterkolumn. Varje länk är ett eget "block" med
          ikonen ovanför texten (inte sida-vid-sida) — ger navigationen mer
          visuell vikt och en riktig app-känsla istället för en tät textlista. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#1a1a19] px-3 py-6 sm:flex">
        <Link href="/" className="mb-8 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#3987e5] text-lg font-bold text-[#3987e5] shadow-[0_0_14px_-2px_rgba(57,135,229,0.65)]">
            A
          </span>
          <span className="text-xs font-bold tracking-wide text-white">ALLSVENSKAN</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-3.5 text-xs font-medium transition-colors before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:content-[''] ${
                  active
                    ? "bg-[#3987e5]/15 text-white before:bg-[#3987e5] before:shadow-[0_0_8px_1px_rgba(57,135,229,0.6)]"
                    : "text-[#c3c2b7] before:bg-transparent hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-6 w-6" /> {item.label}
              </Link>
            );
          })}
          {DISABLED_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                title="Kommer snart"
                className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3.5 text-xs font-medium text-[#898781]/50"
              >
                <Icon className="h-6 w-6" /> {item.label}
              </span>
            );
          })}
        </nav>
        <Link
          href="/settings"
          className={`relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-3.5 text-xs font-medium transition-colors before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:content-[''] ${
            pathname === "/settings"
              ? "bg-[#3987e5]/15 text-white before:bg-[#3987e5] before:shadow-[0_0_8px_1px_rgba(57,135,229,0.6)]"
              : "text-[#c3c2b7] before:bg-transparent hover:bg-white/5 hover:text-white"
          }`}
        >
          <SettingsIcon className="h-6 w-6" /> Inställningar
        </Link>
      </aside>

      {/* Mobil: horisontell topplist */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#1a1a19] px-2 py-2 sm:hidden">
        {[...NAV_ITEMS, { href: "/settings", label: "Inställningar", icon: SettingsIcon }].map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-[#c3c2b7]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" /> {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
