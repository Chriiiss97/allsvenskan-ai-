"use client";

import type { LiveFeed } from "@/lib/football/live-feed";
import { StatCompareRow } from "@/components/data/StatCompareRow";
import { useLiveFeed } from "./useLiveFeed";

/**
 * Fas 20 (2026-08-23) — lagstatistik under pågående match.
 *
 * Fanns tidigare som en serverrenderad fallback på matchsidan: den lästes
 * en gång vid sidladdning och stod sedan still, och den visades bara om
 * matchen redan var live i det ögonblick sidan renderades. Öppnade man
 * sidan före avspark dök statistiken aldrig upp alls.
 *
 * Fyra värden, inte tjugofem: bollinnehav, skott, skott på mål och hörnor.
 * Det är EXAKT vad fixture_live_snapshots faktiskt innehåller under en
 * match — /fixtures/statistics returnerar fler mått, men de sparas inte
 * live idag, och att visa ett tomt fält vore sämre än att inte visa det.
 * Den fullständiga statistiken (inkl. xG, fouls, passningar) kommer efter
 * matchslut via post-match-importen och renderas då av matchsidan istället.
 *
 * En rad visas bara när minst en sida har ett värde — aldrig "– mot –".
 */

const ROWS = [
  { key: "possession", label: "Bollinnehav", suffix: "%" },
  { key: "shots", label: "Skott" },
  { key: "shotsOnTarget", label: "Skott på mål" },
  { key: "corners", label: "Hörnor" },
] as const;

export function LiveMatchStats({
  initial,
  fixtureId,
  homeName,
  awayName,
}: {
  initial: LiveFeed;
  fixtureId: number;
  homeName: string;
  awayName: string;
}) {
  const { feed } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, true);
  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initial.matches.find((m) => m.fixtureId === fixtureId);
  const stats = match?.stats ?? null;

  const rows = ROWS.map((row) => ({ ...row, value: stats?.[row.key] ?? null })).filter(
    (row) => row.value && (row.value.home != null || row.value.away != null)
  );

  const inPlay = match?.phase === "live" || match?.phase === "paused";

  // Komponenten äger HELA sektionen, rubriken inkluderad — annars hade
  // matchsidan behövt rendera en "📊 Lagstatistik"-rubrik före avspark och
  // sedan hoppats på att något dyker upp under den. En tom rubrik är
  // precis den sortens halvtomma kort som inte ska finnas.
  if (!inPlay && rows.length === 0) return null;

  return (
    <div className="border-t border-white/5 pt-8">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <span aria-hidden>📊</span> Lagstatistik
      </h2>
      <div className="mt-5">
        {rows.length === 0 ? (
          // Matchen rullar men API:t har inte rapporterat någon statistik
          // än (vanligt de första minuterna). Säg det rakt ut istället för
          // att visa nollor som ser ut som mätvärden.
          <p className="text-sm text-[#898781]">Statistik inte tillgänglig ännu — hämtas löpande under matchen.</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[#7d7c76]">
              <span>{homeName}</span>
              <span>{awayName}</span>
            </div>
            <div className="mt-1 divide-y divide-white/5">
              {rows.map((row) => (
                <StatCompareRow
                  key={row.key}
                  label={row.label}
                  home={row.value!.home}
                  away={row.value!.away}
                  suffix={"suffix" in row ? row.suffix : undefined}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#5f5e59]">
              Live-statistik under matchen — den fullständiga lagstatistiken (inkl. xG) läggs till efter matchslut.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
