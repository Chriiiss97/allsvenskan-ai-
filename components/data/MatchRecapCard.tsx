import { colors } from "@/lib/design/tokens";
import type { MatchRecap } from "@/lib/football/match-recap";

const VERDICT_META: Record<MatchRecap["verdict"], { dot: string; label: string }> = {
  confirmed: { dot: colors.status.result.win, label: "Förhandsanalysen träffade rätt" },
  mixed: { dot: colors.status.confidence.medium, label: "Blandad träffbild" },
  missed: { dot: colors.status.result.loss, label: "Förhandsanalysen hade fel" },
  "no-favorite": { dot: colors.text.faint, label: "Ingen tydlig favorit inför matchen" },
};

/**
 * Fas 16f (2026-08-22) — "Matchrapport": ställer förhandsanalysen mot
 * facit. Se lib/football/match-recap.ts:s filhuvud för hela domlogiken —
 * den här komponenten är ren presentation av redan beräknade fält, ingen
 * egen tolkning här.
 */
export function MatchRecapCard({ recap }: { recap: MatchRecap }) {
  const meta = VERDICT_META[recap.verdict];
  const hasBreakdown = recap.confirmingPoints.length > 0 || recap.surprisingPoints.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} aria-hidden />
        <p className="text-sm font-semibold uppercase tracking-[0.1em]" style={{ color: meta.dot }}>
          {meta.label}
        </p>
      </div>
      <p className="mt-2 text-lg font-medium leading-relaxed text-white sm:text-xl">{recap.summary}</p>

      {recap.preMatchReasons.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {recap.preMatchReasons.map((r) => (
            <span key={r} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] tabular-nums text-[#898781]">
              {r}
            </span>
          ))}
        </div>
      )}

      {hasBreakdown && (
        <div className="mt-6 grid gap-6 border-t border-white/5 pt-5 sm:grid-cols-2">
          {recap.confirmingPoints.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Bekräftade analysen</p>
              <ul className="mt-2 space-y-1.5">
                {recap.confirmingPoints.map((p) => (
                  <li key={p} className="text-sm text-[#c3c2b7]">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recap.surprisingPoints.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Överraskade</p>
              <ul className="mt-2 space-y-1.5">
                {recap.surprisingPoints.map((p) => (
                  <li key={p} className="text-sm text-[#c3c2b7]">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!recap.hasStatsData && recap.verdict !== "no-favorite" && (
        <p className="mt-4 text-xs text-[#5f5e59]">Vi har inte tillräcklig matchstatistik för den här matchen för att förklara varför i detalj.</p>
      )}
    </div>
  );
}
