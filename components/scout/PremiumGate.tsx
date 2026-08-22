import type { ReactNode } from "react";

/**
 * Fas 14.5 (plans/humble-giggling-biscuit.md) — delad premium-spärr, nu
 * återanvänd av Fas 14.6:s Match Preview också (planen: "bakom samma
 * entitlement-flagga som Scout men eget visuellt märke") — därför
 * parametrisk över titel/beskrivning/emoji/accentfärg istället för
 * hårdkodad "Scout Premium"-text. INGEN riktig betalning bakom knappen än
 * (beslutat med användaren) — "Bli medlem" är medvetet en placeholder
 * (disabled-styled, ingen href), inte en länk till ingenstans. Renderar
 * fortfarande `children` (bara blurrat/overlayat) snarare än att hoppa
 * över dem helt — enklast sätt att ge en ärlig "här är vad du missar"-
 * känsla utan att duplicera sidans innehåll i två versioner.
 */
export function PremiumGate({
  hasAccess,
  children,
  title = "Scout Premium",
  description = "DNA, arketyper, percentiler, sökning, jämförelse och shortlist — hela scoutingplattformen kräver ett Scout-medlemskap.",
  emoji = "🧬",
  accentColor = "#a78bfa",
  ctaLabel = "Bli Scout-medlem",
}: {
  hasAccess: boolean;
  children: ReactNode;
  title?: string;
  description?: string;
  emoji?: string;
  accentColor?: string;
  ctaLabel?: string;
}) {
  if (hasAccess) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-[#0d0d0d]/40 via-[#0d0d0d]/80 to-[#0d0d0d] pt-16">
        <div className="mx-4 max-w-sm rounded-2xl border p-6 text-center shadow-xl" style={{ borderColor: `${accentColor}4d`, backgroundColor: "#141117" }}>
          <p className="text-2xl">{emoji}</p>
          <h2 className="mt-2 text-lg font-bold text-white">{title}</h2>
          <p className="mt-2 text-sm text-[#c3c2b7]">{description}</p>
          <button
            type="button"
            disabled
            title="Betalning inte live än — kontakta admin för åtkomst under tiden."
            className="mt-4 w-full cursor-not-allowed rounded-lg px-4 py-2.5 text-sm font-semibold text-white/70"
            style={{ backgroundColor: `${accentColor}66` }}
          >
            {ctaLabel}
          </button>
          <p className="mt-2 text-xs text-[#7d7c76]">Kommer snart — kontakta admin för åtkomst under tiden.</p>
        </div>
      </div>
    </div>
  );
}
