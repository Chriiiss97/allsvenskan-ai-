import type { MatchPhase } from "@/lib/football/live-status";

/**
 * Fas 20 (2026-08-23) — den delade live-indikatorn.
 *
 * Designbeslut: EN pulserande prick, i EN färg (#e0645f — samma som
 * startsidans live-yta redan använde), och ingenting annat som rör sig.
 * Kravet var uttryckligen "levande utan att kännas rörigt" och "undvik ett
 * blinkande neon-LIVE-system", så pulsen bär hela signalen. Under paus
 * slutar den pulsera men prickan är kvar dämpad: matchen pågår, men
 * ingenting händer just nu — två olika lägen som ska se olika ut.
 */
export function LiveDot({ phase }: { phase: MatchPhase }) {
  if (phase === "live") {
    return (
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0645f]/50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e0645f]" />
      </span>
    );
  }
  if (phase === "paused") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-[#e0645f]/50" aria-hidden />;
  }
  return null;
}

/**
 * Statuspillen bredvid ställningen. Tre visuella lägen, inte sju: pågår
 * (röd), pågår-men-paus (dämpad röd), och allt annat (neutral grå). Fler
 * färger hade gjort en matchlista till ett lapptäcke utan att tillföra
 * information — fasen syns redan i texten.
 */
export function StatusPill({ phase, label }: { phase: MatchPhase; label: string | null }) {
  if (!label) return null;

  const tone =
    phase === "live"
      ? "border-[#e0645f]/40 bg-[#e0645f]/10 text-[#e0645f]"
      : phase === "paused"
        ? "border-[#e0645f]/25 bg-[#e0645f]/[0.06] text-[#e0645f]/80"
        : phase === "cancelled"
          ? "border-white/10 bg-white/5 text-[#d9a526]"
          : "border-white/10 bg-white/5 text-[#898781]";

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${tone}`}>
      <LiveDot phase={phase} />
      {label}
    </span>
  );
}
