import type { ReactNode } from "react";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 19 — den delade "A vs B"-rubriken på /scout/compare. Samma ram för
 * spelar- och lagläget (bara innehållet i kolumnerna skiljer), så de två
 * lägena läses som EN sida med ett växlingsläge, inte två sidor med olika
 * visuella språk. Färgparet (blå A / orange B, colors.compare) sätts här och
 * går igen i CompareStatRows och radarn — samma lag har samma färg överallt
 * på sidan.
 */
export function VersusHero({
  left,
  right,
  caption,
  footer,
}: {
  left: ReactNode;
  right: ReactNode;
  /** Rad under "VS" — t.ex. "Säsong 2024 · resultatbaserat". */
  caption?: ReactNode;
  /** Valfri rad längst ner i kortet (t.ex. formpillar per lag). */
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141418]">
      {/* Tunn färgremsa: A:s färg till vänster, B:s till höger — sidans
          färgnyckel, utan en extra legend-rad som tar plats. */}
      <div className="flex h-0.5">
        <div className="flex-1" style={{ backgroundColor: colors.compare.a }} />
        <div className="flex-1" style={{ backgroundColor: colors.compare.b }} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-5 sm:gap-6 sm:p-6">
        <div className="min-w-0">{left}</div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-bold tracking-[0.2em] text-[#5f5e59]">VS</span>
        </div>
        <div className="min-w-0">{right}</div>
      </div>
      {caption && (
        <p className="border-t border-white/5 px-5 py-2.5 text-center text-xs text-[#898781]">{caption}</p>
      )}
      {footer && <div className="border-t border-white/5 px-5 py-3">{footer}</div>}
    </div>
  );
}

/**
 * En hjältekolumn: bild/logga, namn, underrubrik och ett stort "headline"-tal
 * (OVR för spelare, poäng för lag). Sidan avgör vilken sida som är A/B —
 * `side` styr bara justeringen, så de två kolumnerna speglar varandra.
 */
export function VersusHeroSide({
  side,
  media,
  name,
  subLabel,
  headlineValue,
  headlineLabel,
  headlineColor,
  note,
  badge,
}: {
  side: "a" | "b";
  media?: ReactNode;
  name: string;
  subLabel?: ReactNode;
  headlineValue?: ReactNode;
  headlineLabel?: string;
  /** Egen färg på headline-talet (OVR-band) — annars lagfärgen A/B. */
  headlineColor?: string;
  note?: ReactNode;
  badge?: ReactNode;
}) {
  const align = side === "a" ? "items-start text-left" : "items-end text-right";
  const color = headlineColor ?? (side === "a" ? colors.compare.a : colors.compare.b);

  return (
    <div className={`flex flex-col gap-2 ${align}`}>
      {media}
      <div className={`flex w-full flex-col ${align}`}>
        <p className="w-full truncate text-base font-bold leading-tight text-white sm:text-xl" title={name}>
          {name}
        </p>
        {subLabel && <p className="mt-0.5 w-full truncate text-xs text-[#898781]">{subLabel}</p>}
      </div>
      {headlineValue !== undefined && (
        <div className={`flex flex-col ${align}`}>
          <span className="text-3xl font-bold leading-none tabular-nums sm:text-5xl" style={{ color }}>
            {headlineValue}
          </span>
          {headlineLabel && (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">
              {headlineLabel}
            </span>
          )}
        </div>
      )}
      {badge}
      {note && <p className="w-full text-[11px] leading-snug text-[#7d7c76]">{note}</p>}
    </div>
  );
}
