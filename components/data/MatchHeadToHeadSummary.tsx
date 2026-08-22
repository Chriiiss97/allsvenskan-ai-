import { RecordBar } from "./RecordBar";
import { colors } from "@/lib/design/tokens";
import type { H2HSummary } from "@/lib/football/match-h2h-summary";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

/**
 * Fas 16/16c (2026-08-22) — ersätter 6 separata "X har vunnit/förlorat/
 * hållit nollan"-punkter med EN kompakt sammanfattning. Detaljerna (per-
 * matchtyp-sviter osv.) ligger kvar bakom "Visa detaljer" i FactSection.
 *
 * Fas 16c: borttagen bordered box + horisontell layout ersatt med tre
 * siffer-block delade av tunna vertikala linjer ("scoreboard", designbriefens
 * "siffrorna ska nästan fungera som typografiska objekt") — ligger direkt på
 * sidans yta.
 */
export function MatchHeadToHeadSummary({ summary, homeName, awayName }: { summary: H2HSummary; homeName: string; awayName: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#7d7c76]">{summary.windowLabel}</p>

      <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 text-center">
        <div>
          <p className="text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: colors.compare.a }}>
            {summary.homeWins}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-[#898781]">{homeName}</p>
        </div>
        <div>
          <p className="text-4xl font-bold tabular-nums text-[#5f5e59] sm:text-5xl">{summary.draws}</p>
          <p className="mt-1 text-[11px] font-medium text-[#898781]">Oavgjorda</p>
        </div>
        <div>
          <p className="text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: colors.compare.b }}>
            {summary.awayWins}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-[#898781]">{awayName}</p>
        </div>
      </div>

      <div className="mt-4">
        <RecordBar wins={summary.homeWins} draws={summary.draws} losses={summary.awayWins} variant="teams" />
      </div>

      {(summary.homeGoalsPerMatch != null || summary.awayGoalsPerMatch != null) && (
        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
          <span className="font-semibold tabular-nums text-white">{summary.homeGoalsPerMatch != null ? fmt(summary.homeGoalsPerMatch) : "–"}</span>
          <span className="text-[11px] uppercase tracking-wide text-[#7d7c76]">Mål / match</span>
          <span className="font-semibold tabular-nums text-white">{summary.awayGoalsPerMatch != null ? fmt(summary.awayGoalsPerMatch) : "–"}</span>
        </div>
      )}
      {summary.homeWinsAtHome != null && (
        <p className="mt-2 text-[11px] text-[#7d7c76]">
          {homeName} hemma: {summary.homeWinsAtHome} av {summary.homeWins} vinster
        </p>
      )}
    </div>
  );
}
