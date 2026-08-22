import { colors } from "@/lib/design/tokens";
import type { ComparisonHighlight } from "@/lib/football/match-preview-sv";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

const VISIBLE_COUNT = 4;

/**
 * Fas 16c/16d (2026-08-22) — "Jämfört med ligasnittet" som riktiga
 * jämförelsestaplar istället för en punktlista. Samma exakta value/mean-tal
 * som Sportmonks engelska mening byggde på, bara ritade istället för
 * skrivna. Fas 16d: TVÅ staplar (laget/ligan) istället för en stapel + en
 * snittmarkör — lättare att se skillnaden direkt — och en egen, uttalad
 * "Över/Under ligasnittet"-rad, inte bara procentsatsen.
 */
function ComparisonRow({ c }: { c: ComparisonHighlight }) {
  const scaleMax = Math.max(c.value, c.mean, 0.0001) * 1.05;
  const teamPct = Math.min(100, (c.value / scaleMax) * 100);
  const leaguePct = Math.min(100, (c.mean / scaleMax) * 100);
  const up = c.deltaPct >= 0;

  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-white">{c.subject}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#7d7c76]">{c.statLabel}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">
        {fmt(c.value)} <span className="text-xs font-medium uppercase tracking-wide text-[#898781]">{c.statLabel} / match</span>
      </p>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] text-[#898781]">{c.subject.length > 12 ? c.subject.slice(0, 11) + "…" : c.subject}</span>
          <div className="h-1.5 flex-1 rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, teamPct)}%`, backgroundColor: colors.accent.matchPreview }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] text-[#898781]">Liga</span>
          <div className="h-1.5 flex-1 rounded-full bg-white/5">
            <div className="h-full rounded-full bg-white/25" style={{ width: `${Math.max(2, leaguePct)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-[#7d7c76]">Ligasnitt {fmt(c.mean)}</span>
        <span className="text-[11px] font-medium" style={{ color: colors.accent.matchPreview }}>
          {up ? "▲" : "▼"} {fmt(Math.abs(c.deltaPct))} % · {up ? "Över" : "Under"} ligasnittet
        </span>
      </div>
    </div>
  );
}

export function MatchLeagueComparisons({ comparisons }: { comparisons: ComparisonHighlight[] }) {
  if (comparisons.length === 0) return null;
  const visible = comparisons.slice(0, VISIBLE_COUNT);
  const rest = comparisons.slice(VISIBLE_COUNT);

  return (
    <div className="divide-y divide-white/5">
      {visible.map((c) => (
        <ComparisonRow key={c.key} c={c} />
      ))}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none py-3 text-xs font-medium text-[#898781] marker:content-none hover:text-[#c3c2b7]">
            Visa {rest.length} till <span className="text-[#5f5e59] group-open:hidden">▾</span>
            <span className="hidden text-[#5f5e59] group-open:inline">▴</span>
          </summary>
          <div className="divide-y divide-white/5">
            {rest.map((c) => (
              <ComparisonRow key={c.key} c={c} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
