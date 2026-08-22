import type { ConfidenceTier } from "@/lib/football/confidence";
import { ConfidenceChip } from "./ConfidenceChip";

/**
 * Fas 15 (Complete Scout Player Card) — "förstå spelaren på 5 sekunder".
 * Ren presentation: rad-urvalet (positionsberoende) görs i
 * app/(scout)/scout/spelare/[id]/page.tsx utifrån redan beräknad data
 * (PlayerRating/GoalkeeperRating/getPlayerProfile.stats/AdvancedPlayerDNA)
 * — den här komponenten lägger bara ut dem i ett rutnät, medvetet begränsat
 * till max 7 (se anropsstället) så det aldrig blir en talvägg.
 */
export interface SnapshotRow {
  label: string;
  value: string;
}

export function PlayerSnapshot({ rows, confidence }: { rows: SnapshotRow[]; confidence: ConfidenceTier | null }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Snapshot</h2>
        {confidence && <ConfidenceChip tier={confidence} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
        {rows.map((r) => (
          <div key={r.label} className="text-center">
            <p className="text-xl font-bold tabular-nums text-white">{r.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#898781]">{r.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
