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
const ExploreIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <rect x="4.2" y="13.5" width="3.4" height="6.5" rx="1" />
    <rect x="10.3" y="9" width="3.4" height="11" rx="1" />
    <rect x="16.4" y="4.5" width="3.4" height="15.5" rx="1" />
  </svg>
);
const PlayerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <circle cx="12" cy="8" r="3.3" />
    <path d="M5 20c0-4.2 3.1-6.5 7-6.5s7 2.3 7 6.5" />
  </svg>
);
// Kikare — scouting-metaforen, skiljer sig medvetet från PlayerIcon (person)
// så "hitta/jämför många spelare" (Scout) läses visuellt annorlunda från
// "se en spelare" (Spelare) redan i ikonen, inte bara i etiketten.
const ScoutIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <circle cx="7.3" cy="15.8" r="3" />
    <circle cx="16.7" cy="15.8" r="3" />
    <path d="M10 14.2L8.7 6.5a1.6 1.6 0 011.6-1.9h3.4a1.6 1.6 0 011.6 1.9l-1.3 7.7M10.3 15.8h3.4" />
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
const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps(props)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

interface NavItem {
  href?: string;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
  disabled?: boolean;
  // "Utforska" pekar (medvetet, se komponentkommentaren nedan) på samma
  // route som "Spelare" — den ska därför aldrig visas som aktiv själv,
  // annars lyser två länkar blått samtidigt på /spelare.
  trackActive?: boolean;
  // Admin-länken får en avvikande (gul) accentfärg, Scout en violett —
  // samma violetta ton som redan etablerad för Sportmonks-lagret
  // (AdvancedDNA/AdvancedDevelopment, #a78bfa) — så Scout läses som en
  // egen, avgränsad produkt redan i menyn, inte appens vanliga blå.
  accent?: "blue" | "amber" | "violet";
}

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: EyeIcon, accent: "amber" };

// Ordning matchar användarens referens: "vad vill jag göra" (Chatta →
// Utforska → Matcher → Tabeller) följt av "vad vill jag undersöka"
// (Lag → Spelare), med Inställningar sist i samma kompakta grupp —
// inte utspridd över hela sidohöjden.
//
// Fas 14.1 (routing-skelett): hrefs uppdaterade till den nya, kortare
// URL-strukturen (/matcher, /lag, /spelare, /scout/spelare) — se
// plans/humble-giggling-biscuit.md. Scout pekar nu in i en egen
// route-grupp ((scout), eget layout.tsx) med violett accent istället för
// att vara ännu en flik bland de andra — full egen navigation/shell för
// Scout byggs i Fas 14.4, det här är bara den första visuella markören.
const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chatta", icon: ChatIcon },
  // Ingen egen "utforska-hub"-sida finns ännu (skulle vara en ny route,
  // vilket vi medvetet inte lägger till här) — pekar därför på samma
  // ingång som startsidans "Utforska data"-kort.
  { href: "/spelare", label: "Utforska", icon: ExploreIcon, trackActive: false },
  { href: "/matcher", label: "Matcher", icon: MatchIcon },
  { href: "/tabell", label: "Tabeller", icon: StandingsIcon },
  { href: "/lag", label: "Lag", icon: TeamIcon },
  { href: "/spelare", label: "Spelare", icon: PlayerIcon },
  // Egen huvudsektion (2026-08-21), medvetet skild från "Spelare" — Scout är
  // det stora, kombinerbara sök-/filterverktyget (klubb+position+ålder+OVR+
  // statistik+historik/utveckling i EN vy), Spelare förblir den enklare
  // översikten. Se app/(scout)/scout/spelare/page.tsx.
  { href: "/scout/spelare", label: "Scout", icon: ScoutIcon, accent: "violet" },
  { href: "/settings", label: "Inställningar", icon: SettingsIcon },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const activeClasses =
    item.accent === "amber"
      ? "bg-amber-400/15 text-white before:bg-amber-400 before:shadow-[0_0_8px_1px_rgba(251,191,36,0.6)]"
      : item.accent === "violet"
        ? "bg-[#a78bfa]/15 text-white before:bg-[#a78bfa] before:shadow-[0_0_8px_1px_rgba(167,139,250,0.6)]"
        : "bg-[#3987e5]/15 text-white before:bg-[#3987e5] before:shadow-[0_0_8px_1px_rgba(57,135,229,0.6)]";
  const classes = `relative flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-medium leading-tight transition-colors before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:content-[''] ${
    active ? activeClasses : "text-[#c3c2b7] before:bg-transparent hover:bg-white/5 hover:text-white"
  }`;

  if (item.disabled || !item.href) {
    return (
      <span title="Kommer snart" className={`${classes} text-[#898781]/50 hover:bg-transparent hover:text-[#898781]/50`}>
        <Icon className="h-6 w-6" />
        {item.label}
      </span>
    );
  }

  return (
    <Link href={item.href} className={classes}>
      <Icon className="h-6 w-6" />
      {item.label}
    </Link>
  );
}

/**
 * Fast, smal vänsterkolumn på desktop (app-sidebar, inte en bred
 * hemsidemeny) — en enkel horisontell topplist som fallback på mobil.
 */
export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <>
      {/* Desktop: smal, kompakt vänsterkolumn. Menygruppen ligger som ett
          tätt kluster direkt under loggan — den sträcks INTE ut över hela
          sidohöjden, tomrummet hamnar under sista länken istället. */}
      <aside className="hidden w-[112px] shrink-0 flex-col border-r border-white/10 bg-[#1a1a19] px-2 py-5 sm:flex">
        <Link href="/" className="mb-5 flex flex-col items-center gap-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#3987e5] text-xs font-bold text-[#3987e5] shadow-[0_0_10px_-2px_rgba(57,135,229,0.65)]">
            A
          </span>
          <span className="text-center text-[9px] font-bold leading-none tracking-wide text-white">
            ALLSVENSKAN
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              item.trackActive !== false &&
              !!item.href &&
              (pathname === item.href || pathname?.startsWith(item.href + "/"));
            return <NavLink key={item.label} item={item} active={active} />;
          })}
        </nav>
      </aside>

      {/* Mobil: horisontell topplist */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#1a1a19] px-2 py-2 sm:hidden">
        {items.map((item) => {
          const active =
            item.trackActive !== false &&
            !!item.href &&
            (pathname === item.href || pathname?.startsWith(item.href + "/"));
          const Icon = item.icon;
          if (item.disabled || !item.href) {
            return (
              <span
                key={item.label}
                title="Kommer snart"
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[#898781]/50"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" /> {item.label}
              </span>
            );
          }
          const activeClasses =
            item.accent === "amber"
              ? "bg-amber-400/15 text-white"
              : item.accent === "violet"
                ? "bg-[#a78bfa]/15 text-white"
                : "bg-white/10 text-white";
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? activeClasses : "text-[#c3c2b7]"
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
