"use client";

import { useState } from "react";
import type { PlayerMatchLogEntry } from "@/lib/football/player-match-log";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 15 (Complete Scout Player Card) — match-för-match-logg. NY data
 * (lib/football/player-match-log.ts), tidigare inte visad någonstans (se
 * datainventeringen i plans/humble-giggling-biscuit.md §1b). "use client"
 * bara för "visa alla"-togglen — tar ENDAST redan serialiserad data som
 * props, inga funktioner över server→klient-gränsen.
 */
const RESULT_COLOR: Record<string, string> = {
  win: colors.status.result.win,
  draw: colors.status.result.draw,
  loss: colors.status.result.loss,
};
const RESULT_LABEL: Record<string, string> = { win: "V", draw: "O", loss: "F" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

const INITIAL_COUNT = 10;

export function MatchLogSection({ entries, isGoalkeeper }: { entries: PlayerMatchLogEntry[]; isGoalkeeper: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, INITIAL_COUNT);

  return (
    <details open className="group rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <span aria-hidden>🗓️</span>
          Matchlogg
        </span>
        <span className="text-xs text-[#898781]">{entries.length} matcher</span>
      </summary>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left text-[#7d7c76]">
              <th className="pb-2 font-medium">Datum</th>
              <th className="pb-2 font-medium">Motstånd</th>
              <th className="pb-2 text-center font-medium">Resultat</th>
              <th className="pb-2 text-right font-medium">Min</th>
              {isGoalkeeper ? (
                <>
                  <th className="pb-2 text-right font-medium">Räddn.</th>
                  <th className="pb-2 text-right font-medium">Insläppta</th>
                  <th className="pb-2 text-center font-medium">CS</th>
                </>
              ) : (
                <>
                  <th className="pb-2 text-right font-medium">Mål</th>
                  <th className="pb-2 text-right font-medium">Assist</th>
                  <th className="pb-2 text-right font-medium">Betyg</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.fixtureId} className="border-b border-white/5 text-[#c3c2b7]">
                <td className="py-1.5 whitespace-nowrap">{formatDate(m.kickoffAt)}</td>
                <td className="py-1.5 truncate">
                  {m.isHome ? "" : "@ "}
                  {m.opponentName}
                </td>
                <td className="py-1.5 text-center tabular-nums">
                  {m.teamScore !== null && m.opponentScore !== null ? (
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: m.result ? RESULT_COLOR[m.result] : undefined }}
                    >
                      {m.result && RESULT_LABEL[m.result]} {m.teamScore}–{m.opponentScore}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{m.minutesPlayed ?? "—"}</td>
                {isGoalkeeper ? (
                  <>
                    <td className="py-1.5 text-right tabular-nums">{m.saves ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.goalsConceded ?? "—"}</td>
                    <td className="py-1.5 text-center">{m.cleanSheet ? "✓" : ""}</td>
                  </>
                ) : (
                  <>
                    <td className="py-1.5 text-right tabular-nums">{m.goals ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.assists ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.rating ?? "—"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entries.length > INITIAL_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-[#a78bfa] hover:underline"
        >
          {expanded ? "Visa färre" : `Visa alla ${entries.length} matcher`}
        </button>
      )}
    </details>
  );
}
