"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Fas 17 (2026-08-22) — liten "?"-knapp som visar en förklarande popover,
 * efter användarens FotMob-referens ("Spelaregenskaper"-diagrammets egen
 * frågeteckensknapp). Egen text, egen metodikbeskrivning (INTE FotMobs
 * text) — beskriver hur VÅR beräkning faktiskt fungerar. Ren `useState`-
 * toggle, ingen extern popover-lib.
 */
export function InfoTooltip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Mer information: ${title}`}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/20 text-[10px] font-semibold text-[#898781] transition-colors hover:border-white/40 hover:text-white"
      >
        ?
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Stäng"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-1/2 top-6 z-50 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-[#1a1a19] p-4 text-left shadow-xl sm:w-80">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{title}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Stäng" className="text-[#898781] hover:text-white">
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-[#c3c2b7]">{children}</div>
          </div>
        </>
      )}
    </span>
  );
}
