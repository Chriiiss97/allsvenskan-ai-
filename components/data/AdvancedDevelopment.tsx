"use client";

import type { AdvancedDevelopmentSummary } from "@/lib/football/rating/advanced-development";

/**
 * Fas 12 — "varför", inte bara siffra. Komplement till PlayerRatingHistory
 * (OVR-trenden), aldrig en ersättning — rör inte den komponenten alls.
 * Döljs helt (samma princip som AdvancedDNA) om spelaren saknar minst två
 * Sportmonks-täckta säsonger att jämföra.
 */
const ADVANCED_ACCENT = "#a78bfa";

export function AdvancedDevelopment({ development }: { development: AdvancedDevelopmentSummary }) {
  if (!development.available) return null;

  const { seasonAYear, seasonBYear, categoryDeltas, biggestMover, whyText } = development;

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Vad drev utvecklingen?</h2>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${ADVANCED_ACCENT}26`, color: ADVANCED_ACCENT }}
        >
          Sportmonks · {seasonAYear}→{seasonBYear}
        </span>
      </div>

      {whyText ? (
        <p className="mt-2 text-sm leading-relaxed text-[#c3c2b7]">{whyText}</p>
      ) : (
        <p className="mt-2 text-sm text-[#898781]">
          Ingen enskild avancerad mätare stack ut mellan {seasonAYear} och {seasonBYear} — jämn utveckling över hela profilen.
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
        {categoryDeltas.map((c) => {
          if (c.scoreA === null || c.scoreB === null) {
            return (
              <div key={c.key} className="flex items-center justify-between text-xs">
                <span className="text-[#7d7c76]">{c.label}</span>
                <span className="text-[#7d7c76]">Ej tillgängligt en av säsongerna</span>
              </div>
            );
          }
          const delta = c.delta ?? 0;
          const deltaColor = delta > 0 ? "#22c55e" : delta < 0 ? "#e66767" : "#7d7c76";
          return (
            <div key={c.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#c3c2b7]">{c.label}</span>
              <span className="tabular-nums text-[#898781]">
                {c.scoreA} → {c.scoreB}{" "}
                <span style={{ color: deltaColor }}>
                  ({delta > 0 ? "+" : ""}
                  {delta})
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {biggestMover && (
        <div className="mt-3 rounded-lg bg-black/20 p-2.5 text-[11px] text-[#898781]">
          <span className="text-[#7d7c76]">Underliggande mått: </span>
          {biggestMover.label} {biggestMover.valueA}
          {biggestMover.unit} ({seasonAYear}) → {biggestMover.valueB}
          {biggestMover.unit} ({seasonBYear})
        </div>
      )}
    </div>
  );
}
