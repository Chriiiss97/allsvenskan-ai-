import type { ReactNode } from "react";

/**
 * Fas 14.5 (plans/humble-giggling-biscuit.md) — delad premium-spärr,
 * använd av Scouts layout (och Match Preview i Fas 14.6). INGEN riktig
 * betalning bakom knappen än (beslutat med användaren) — "Bli Scout-
 * medlem" är medvetet en placeholder (disabled-styled, ingen href), inte
 * en länk till ingenstans. Renderar fortfarande `children` (bara
 * blurrat/overlayat) snarare än att hoppa över dem helt — enklast sätt
 * att ge en ärlig "här är vad du missar"-känsla utan att duplicera
 * sidans innehåll i två versioner.
 */
export function PremiumGate({ hasAccess, children }: { hasAccess: boolean; children: ReactNode }) {
  if (hasAccess) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-[#0d0d0d]/40 via-[#0d0d0d]/80 to-[#0d0d0d] pt-16">
        <div className="mx-4 max-w-sm rounded-2xl border border-[#a78bfa]/30 bg-[#141117] p-6 text-center shadow-xl">
          <p className="text-2xl">🧬</p>
          <h2 className="mt-2 text-lg font-bold text-white">Scout Premium</h2>
          <p className="mt-2 text-sm text-[#c3c2b7]">
            DNA, arketyper, percentiler, sökning, jämförelse och shortlist — hela scoutingplattformen kräver ett
            Scout-medlemskap.
          </p>
          <button
            type="button"
            disabled
            title="Betalning inte live än — kontakta admin för åtkomst under tiden."
            className="mt-4 w-full cursor-not-allowed rounded-lg bg-[#a78bfa]/40 px-4 py-2.5 text-sm font-semibold text-white/70"
          >
            Bli Scout-medlem
          </button>
          <p className="mt-2 text-xs text-[#7d7c76]">Kommer snart — kontakta admin för åtkomst under tiden.</p>
        </div>
      </div>
    </div>
  );
}
