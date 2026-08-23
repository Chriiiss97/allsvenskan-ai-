import type { LiveStatRow } from "@/lib/football/live-feed";
import { formatStatValue, STAT_GROUPS, TOP_STAT_TYPE_IDS } from "@/lib/football/live-stat-types";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 21 (2026-08-23) — live-statistik som jämförelserader.
 *
 * Samma visuella språk som matchsidans befintliga StatCompareRow (delad
 * stapel i colors.compare under två tal), men byggd på Sportmonks
 * type_id-baserade live-data istället för de fyra kolumnerna i
 * fixture_live_snapshots. 34 mått finns; vilka som visas var styrs av
 * lib/football/live-stat-types.ts, inte av komponenten.
 *
 * En rad där INGEN sida har ett värde filtreras redan bort i live-feed.ts —
 * hit kommer bara mått som faktiskt är mätta. Har bara ena laget ett värde
 * visas det, och motsatt sida som "–", aldrig som 0.
 */

function StatRow({ row, emphasis }: { row: LiveStatRow; emphasis?: boolean }) {
  const total = (row.home ?? 0) + (row.away ?? 0);
  const homePct = total > 0 ? ((row.home ?? 0) / total) * 100 : 50;
  const bothKnown = row.home != null && row.away != null && total > 0;

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={`w-20 tabular-nums ${emphasis ? "text-base font-bold text-white" : "font-semibold text-white"}`}>
          {formatStatValue(row.home, row)}
        </span>
        <span className="flex-1 text-center text-xs leading-tight text-[#898781]">{row.label}</span>
        <span className={`w-20 text-right tabular-nums ${emphasis ? "text-base font-bold text-white" : "font-semibold text-white"}`}>
          {formatStatValue(row.away, row)}
        </span>
      </div>
      {bothKnown && (
        // 2px mellanrum mellan de två fyllningarna (dataviz: spacer mellan
        // angränsande fills) så gränsen läses även utan färgseende.
        <div className="mt-2 flex h-1 gap-0.5 overflow-hidden rounded-full">
          <div className="h-full rounded-full" style={{ width: `${homePct}%`, backgroundColor: colors.compare.a }} />
          <div className="h-full rounded-full" style={{ width: `${100 - homePct}%`, backgroundColor: colors.compare.b }} />
        </div>
      )}
    </div>
  );
}

/** Toppstatistik — de få måtten som får synas på Fakta-fliken. */
export function TopStats({ rows, homeName, awayName }: { rows: LiveStatRow[]; homeName: string; awayName: string }) {
  const byType = new Map(rows.map((r) => [r.typeId, r]));
  const top = TOP_STAT_TYPE_IDS.map((id) => byType.get(id)).filter((r): r is LiveStatRow => r !== undefined);

  if (top.length === 0) {
    return <p className="text-sm text-[#898781]">Statistik inte tillgänglig ännu.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-[#7d7c76]">
        <span className="truncate">{homeName}</span>
        <span className="truncate text-right">{awayName}</span>
      </div>
      <div className="mt-1 divide-y divide-white/5">
        {top.map((row) => (
          <StatRow key={row.typeId} row={row} emphasis />
        ))}
      </div>
    </div>
  );
}

/** Hela statistikfliken — alla mått, grupperade. */
export function FullStats({ rows, homeName, awayName }: { rows: LiveStatRow[]; homeName: string; awayName: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#898781]">Statistik inte tillgänglig för den här matchen ännu.</p>;
  }

  const byType = new Map(rows.map((r) => [r.typeId, r]));
  const grouped = STAT_GROUPS.map((group) => ({
    title: group.title,
    rows: group.typeIds.map((id) => byType.get(id)).filter((r): r is LiveStatRow => r !== undefined),
  })).filter((g) => g.rows.length > 0);

  // En typ Sportmonks börjat skicka men som ingen grupp känner till ska INTE
  // försvinna tyst — den hamnar sist istället, så ny data syns direkt.
  const grouped_ids = new Set(STAT_GROUPS.flatMap((g) => g.typeIds));
  const ungrouped = rows.filter((r) => !grouped_ids.has(r.typeId));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-[#7d7c76]">
        <span className="truncate">{homeName}</span>
        <span className="truncate text-right">{awayName}</span>
      </div>

      {grouped.map((group) => (
        <div key={group.title}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">{group.title}</p>
          <div className="divide-y divide-white/5">
            {group.rows.map((row) => (
              <StatRow key={row.typeId} row={row} />
            ))}
          </div>
        </div>
      ))}

      {ungrouped.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">Övrigt</p>
          <div className="divide-y divide-white/5">
            {ungrouped.map((row) => (
              <StatRow key={row.typeId} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
