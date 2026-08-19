interface CompareRow {
  label: string;
  a: number;
  b: number;
}

/**
 * "Fjärils"-stapeljämförelse — lag A:s stapel växer inåt från vänster
 * (blå), lag B:s växer inåt från höger (orange), samma konvention som
 * PlayerCompareRadar/RecordBar. Varje rad har sin egen skala (relativt
 * radens eget max), eftersom poäng och mål har helt olika värdeintervall.
 */
export function TeamCompareBars({ rows }: { rows: CompareRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const max = Math.max(Math.abs(row.a), Math.abs(row.b)) * 1.15 || 1;
        const pctA = (Math.abs(row.a) / max) * 100;
        const pctB = (Math.abs(row.b) / max) * 100;
        return (
          <div key={row.label}>
            <p className="mb-1 text-center text-[11px] text-[#898781]">{row.label}</p>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{row.a}</span>
              <div className="flex h-2 flex-1 justify-end overflow-hidden">
                <div className="h-2 rounded-l-full bg-[#3987e5]" style={{ width: `${pctA}%` }} />
              </div>
              <div className="flex h-2 flex-1 overflow-hidden">
                <div className="h-2 rounded-r-full bg-[#d95926]" style={{ width: `${pctB}%` }} />
              </div>
              <span className="w-8 shrink-0 text-xs font-medium tabular-nums">{row.b}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
