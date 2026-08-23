"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Fas 21 (2026-08-23) — matchhubbens flikar.
 *
 * Matchsidan var en enda lodrät kolumn med allt: hero, snabbanalys,
 * matchrapport, tabellplacering, H2H, form, nyckelspelare, ligasnitt,
 * startelvor, lagstatistik, tidslinje. På mobil blev det en sida man
 * scrollade förbi snarare än läste.
 *
 * Flikarna är KLIENTSIDIGA och byter inte URL. Skälet är live: en match som
 * pågår har en tickande klocka och en pollingkanal igång, och en
 * sidnavigering hade rivit ner båda vid varje flikbyte. Innehållet
 * renderas på servern och skickas in som `content` (React Server Components
 * får skickas som props till en klientkomponent) — så flikbytet är gratis,
 * ingen ny hämtning, ingen omrendering av serverinnehållet.
 *
 * Allt innehåll monteras samtidigt och göms med CSS istället för att
 * villkorligt renderas. Det är medvetet: en dold flik som redan finns i DOM
 * behåller sitt tillstånd (utfällda detaljer, scrollposition), och de
 * pollande komponenterna inuti hinner aldrig avmonteras och starta om sin
 * kanal när användaren växlar fram och tillbaka.
 */

export interface MatchTab {
  id: string;
  label: string;
  content: ReactNode;
  /** Utelämnas fliken helt? Används för ytor utan data för just den matchen. */
  hidden?: boolean;
}

/**
 * Låter innehåll INUTI en flik be om att en annan flik öppnas — t.ex.
 * Fakta-flikens "All statistik"-knapp, som ska leda till Statistik-fliken.
 * Utan detta hade knappen behövt vara en länk som laddar om sidan och river
 * ner live-pollingen.
 */
const MatchTabsContext = createContext<((id: string) => void) | null>(null);

export function useOpenMatchTab(): (id: string) => void {
  const open = useContext(MatchTabsContext);
  return useMemo(() => open ?? (() => {}), [open]);
}

export function MatchTabs({ tabs }: { tabs: MatchTab[] }) {
  const visible = tabs.filter((t) => !t.hidden);
  const [active, setActive] = useState(visible[0]?.id ?? "");

  const openTab = useCallback((id: string) => {
    setActive(id);
    // Flikbytet sker längre ner på sidan än flikraden — utan detta hamnar
    // användaren mitt i den nya flikens innehåll.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (visible.length === 0) return null;
  const activeId = visible.some((t) => t.id === active) ? active : visible[0].id;

  return (
    <MatchTabsContext.Provider value={openTab}>
    <div>
      {/* Flikraden scrollar i sidled på mobil istället för att radbrytas —
          sex flikar får aldrig plats på 390px, och en radbruten flikrad
          läses som två navigationsnivåer. */}
      <div
        role="tablist"
        aria-label="Matchvyer"
        className="-mx-6 flex gap-1 overflow-x-auto border-b border-white/10 px-6 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActive(tab.id)}
              data-tab={tab.id}
              className={`relative shrink-0 whitespace-nowrap px-3 pb-3 pt-1 text-sm font-medium transition-colors sm:px-4 ${
                isActive ? "text-white" : "text-[#898781] hover:text-[#c3c2b7]"
              }`}
            >
              {tab.label}
              {/* Understrykningen är den enda aktiv-markören — ingen
                  bakgrundsplatta, ingen ram. Håller flikraden lugn. */}
              {isActive && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#3987e5]" aria-hidden />}
            </button>
          );
        })}
      </div>

      {visible.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== activeId}
          className="pt-8"
        >
          {tab.content}
        </div>
      ))}
    </div>
    </MatchTabsContext.Provider>
  );
}
