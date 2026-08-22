import type { ConfidenceTier } from "@/lib/football/confidence";
import { ConfidenceChip } from "./ConfidenceChip";

/**
 * Fas 15 (Complete Scout Player Card) — "en statistik ska aldrig visas
 * utan att vi förstår underlaget" (användarens explicita krav). Alltid
 * synlig direkt under Snapshot, INTE bara en engångsnotis längst upp.
 * `standingsLabel` byggs i page.tsx från den redan existerande
 * getStandingsTable (Fas 14.0) — ingen ny standings-fråga uppfinns här.
 */
export function ContextBanner({
  confidence,
  appearances,
  minutesPlayed,
  season,
  standingsLabel,
}: {
  confidence: ConfidenceTier | null;
  appearances: number;
  minutesPlayed: number;
  season: number | null;
  standingsLabel: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs text-[#c3c2b7]">
      {confidence && <ConfidenceChip tier={confidence} />}
      <span>
        {appearances} matcher · {minutesPlayed} min{season && ` · ${season}`}
      </span>
      {standingsLabel && <span className="text-[#898781]">{standingsLabel}</span>}
    </div>
  );
}
