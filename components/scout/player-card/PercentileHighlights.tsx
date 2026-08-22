/**
 * Fas 15 (Complete Scout Player Card) — percentiler i vardagsspråk.
 * Ren formattering av redan beräknade percentiler (PlayerDNA/AdvancedDNA-
 * mått, lib/football/percentile.ts) — ingen ny beräkning. Begränsat till
 * ett litet urval (anropsstället väljer de mest avvikande måtten) istället
 * för att kasta alla percentiler på sidan.
 */
export interface PercentileHighlightRow {
  label: string;
  percentile: number;
  peerLabel: string;
}

export function PercentileHighlights({ rows }: { rows: PercentileHighlightRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#c3c2b7]">{r.label}</span>
            <span className="font-medium text-white">{r.percentile}:a percentilen</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#a78bfa]/15">
            <div className="h-1.5 rounded-full bg-[#a78bfa]" style={{ width: `${r.percentile}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-[#7d7c76]">
            Bättre än ca {r.percentile} % av {r.peerLabel}
          </p>
        </div>
      ))}
    </div>
  );
}
