"use client";

import { useState } from "react";
import type { MomentumPoint } from "@/lib/football/live-feed";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 21 (2026-08-23) — momentumgrafen.
 *
 * DATA: Sportmonks `pressure` (fixture_pressure_index) — ett verkligt
 * tryckvärde per lag och minut, hämtat live. Ingen härledning ur skott eller
 * bollinnehav, ingen utjämning: staplarna ÄR mätvärdena.
 *
 * FORM (dataviz-skillet, steg 1): jobbet är polaritet över tid — "vilket lag
 * trycker på just nu" — inte magnitud per kategori. Det ger ett divergerande
 * stapeldiagram kring en mittlinje: hemmalaget uppåt, bortalaget nedåt.
 *
 * FÄRG (steg 2–3): projektets redan validerade tvåentitets-par,
 * colors.compare (#3987e5 / #d95926). Körd genom skillets validator mot vår
 * mörka yta #1a1a19 innan den här filen skrevs — ALLA sex kontroller PASS
 * (CVD ΔE 26,8 protan / 32,4 tritan, normalseende 31,8, kontrast ≥ 3:1).
 * Ingen ny färg uppfunnen.
 *
 * TILLGÄNGLIGHET (steg 6): två serier ⇒ legend finns alltid, och laget
 * skrivs ut i klartext i tooltipen — identiteten bärs aldrig av färgen
 * ensam. Riktningen (upp/ner) är dessutom en andra, färgoberoende kodning.
 */

/** Staplarnas maxhöjd i px, per halva. Hela grafen blir alltså det dubbla. */
const HALF_HEIGHT = 42;

export function MomentumChart({
  points,
  homeName,
  awayName,
  halftimeMinute = 45,
}: {
  points: MomentumPoint[];
  homeName: string;
  awayName: string;
  halftimeMinute?: number;
}) {
  const [hovered, setHovered] = useState<MomentumPoint | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-[#898781]">Momentum är inte tillgängligt för den här matchen.</p>;
  }

  // Skalan normaliseras mot det största trycket i MATCHEN, inte mot ett fast
  // tak — trycksiffrorna är relativa och ett fast tak hade gjort en lugn
  // match till en platt linje och en intensiv till en vägg.
  const peak = Math.max(...points.flatMap((p) => [p.home ?? 0, p.away ?? 0]), 1);
  const lastMinute = points[points.length - 1]?.minute ?? 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {/* Legend — obligatorisk vid två serier. Färgprickarna står bredvid
            lagnamnen; texten själv bär textfärg, inte serifärgen. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#898781]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.compare.a }} aria-hidden />
            {homeName}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.compare.b }} aria-hidden />
            {awayName}
          </span>
        </div>
        {/* Tooltipen ligger på en fast rad ovanför grafen istället för att
            sväva över staplarna — en svävande ruta täcker grannstaplarna
            och är svår att träffa på mobil. */}
        <p className="text-[11px] tabular-nums text-[#c3c2b7]" aria-live="polite">
          {hovered ? `${hovered.minute}′ · ${homeName} ${Math.round(hovered.home ?? 0)} — ${Math.round(hovered.away ?? 0)} ${awayName}` : ""}
        </p>
      </div>

      <div
        className="relative flex items-center gap-px overflow-hidden"
        style={{ height: HALF_HEIGHT * 2 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Mittlinjen är återhållsam — den är en referens, inte data. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" aria-hidden />
        {/* Halvtidsmarkör, streckad så den inte läses som ett mätvärde. */}
        {lastMinute > halftimeMinute && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-white/15"
            style={{ left: `${(halftimeMinute / Math.max(lastMinute, 90)) * 100}%` }}
            aria-hidden
          />
        )}

        {points.map((point) => {
          const homeHeight = ((point.home ?? 0) / peak) * HALF_HEIGHT;
          const awayHeight = ((point.away ?? 0) / peak) * HALF_HEIGHT;
          return (
            <button
              key={point.minute}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHovered(point)}
              onFocus={() => setHovered(point)}
              className="group relative flex h-full flex-1 flex-col justify-center"
              aria-label={`Minut ${point.minute}: ${homeName} ${Math.round(point.home ?? 0)}, ${awayName} ${Math.round(point.away ?? 0)}`}
            >
              <span className="flex h-1/2 items-end justify-center">
                <span
                  className="w-full rounded-t-[2px] transition-opacity group-hover:opacity-100"
                  style={{ height: Math.max(homeHeight, point.home ? 1 : 0), backgroundColor: colors.compare.a, opacity: hovered && hovered.minute !== point.minute ? 0.45 : 1 }}
                />
              </span>
              <span className="flex h-1/2 items-start justify-center">
                <span
                  className="w-full rounded-b-[2px] transition-opacity"
                  style={{ height: Math.max(awayHeight, point.away ? 1 : 0), backgroundColor: colors.compare.b, opacity: hovered && hovered.minute !== point.minute ? 0.45 : 1 }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Halvtidsmarkeringen visas bara när matchen faktiskt passerat den —
          annars stod det "0′ 45′ 43′", en skala som läser sig baklänges. */}
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[#5f5e59]">
        <span>0′</span>
        {lastMinute > halftimeMinute && <span>{halftimeMinute}′</span>}
        <span>{lastMinute}′</span>
      </div>
    </div>
  );
}
