import type { PlayerIntelligenceSnapshot } from "@/lib/football/rating/player-intelligence-read";

/**
 * Fas 8 (Player Intelligence Engine, shadow mode, 2026-08-22) — MEDVETET
 * litet, inte en redesign. Visar motorns skattning BREDVID (aldrig
 * ISTÄLLET FÖR) dagens OVR-kort, tydligt märkt som experimentell. Döljs
 * helt om ingen state finns (samma "aldrig en tom platshållare"-princip
 * som resten av Scout).
 */
export function PlayerIntelligencePanel({ snapshot }: { snapshot: PlayerIntelligenceSnapshot | null }) {
  if (!snapshot) return null;

  return (
    <div className="rounded-xl border border-[#a78bfa]/20 bg-[#141117] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#a78bfa]">
          🧭 Player Intelligence Engine <span className="text-[10px] font-normal uppercase tracking-wide text-[#7d7c76]">Shadow mode</span>
        </h2>
      </div>
      <p className="mt-1 text-xs text-[#898781]">
        Experimentell, minneshållande OVR-skattning (Kalmanfilter) — körs vid sidan av dagens Player Rating, ersätter den inte. Se{" "}
        <span className="text-[#c3c2b7]">research/player-intelligence-engine</span> för metod och backtest.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-white">
            {snapshot.ovr} <span className="text-base font-normal text-[#7d7c76]">± {snapshot.uncertaintySd}</span>
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#898781]">OVR (motor)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-white">{snapshot.latestPerformance ?? "—"}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#898781]">Performance (senaste match)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-white">± {snapshot.uncertaintySd}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#898781]">Osäkerhet</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-white">{snapshot.evidenceMinutes.toLocaleString("sv-SE")}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#898781]">Evidens (min)</p>
        </div>
      </div>

      <p className="mt-3 border-t border-white/5 pt-2 text-[10px] text-[#5f5e59]">
        {snapshot.observationCount} matcher bearbetade · modell {snapshot.modelVersion}
        {snapshot.lastKickoffAt && ` · senast uppdaterad ${new Date(snapshot.lastKickoffAt).toLocaleDateString("sv-SE")}`}
      </p>
    </div>
  );
}
