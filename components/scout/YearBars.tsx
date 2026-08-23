/**
 * Fas 22b (2026-08-23, användarkrav "lägg till en importkurva under export")
 * — den delade stapelformen för Scoutens årskurvor: exportkurvan och
 * importkurvan på /scout/efter-allsvenskan, och värvningskurvan på
 * /scout/varvningar.
 *
 * Varför en gemensam komponent och inte tre kopior av samma markup: export-
 * och importkurvan ligger under varandra och ska JÄMFÖRAS. Går skalorna isär
 * ser en importtopp på 110 exakt lika hög ut som en exporttopp på 101, och
 * jämförelsen blir falsk. Anroparen skickar därför in `max` själv — samma
 * `max` till båda kurvorna — istället för att varje diagram normaliserar mot
 * sitt eget största värde.
 *
 * `count: null` betyder "ingen data för det året" och ritas som ett streck,
 * aldrig som en nollstapel: en nolla hade påstått att inga spelare värvades,
 * när sanningen är att underlaget inte når så långt bak.
 */
const BAR_TONE = {
  violet: { peak: "bg-[#a78bfa]", rest: "bg-[#a78bfa]/45" },
  blue: { peak: "bg-[#3987e5]", rest: "bg-[#3987e5]/50" },
} as const;

export interface YearBarRow {
  year: number;
  count: number | null;
}

export function YearBars({
  rows,
  max,
  tone = "violet",
  unit,
}: {
  rows: YearBarRow[];
  max: number;
  tone?: keyof typeof BAR_TONE;
  /** Ordet i hovertexten ("spelare", "värvningar") — aldrig utskrivet i diagrammet. */
  unit: string;
}) {
  const peak = Math.max(0, ...rows.map((r) => r.count ?? 0));
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {rows.map((r) => {
        const isMax = r.count !== null && r.count === peak;
        return (
          <div
            key={r.year}
            className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1.5"
            title={r.count === null ? `${r.year}: ingen data` : `${r.year}: ${r.count} ${unit}`}
          >
            <span className={`text-[11px] font-semibold tabular-nums ${isMax ? "text-white" : "text-[#898781]"}`}>
              {r.count === null ? <span className="text-[#3d3c39]">–</span> : r.count}
            </span>
            {r.count === null ? (
              <div className="h-[2px] w-full rounded-full bg-white/[.07]" aria-hidden />
            ) : (
              <div
                className={`w-full rounded-t-sm ${isMax ? BAR_TONE[tone].peak : BAR_TONE[tone].rest}`}
                style={{ height: `${Math.max(8, Math.round((r.count / max) * 120))}px` }}
              />
            )}
            <span className="text-[10px] tabular-nums text-[#7d7c76]">{r.year}</span>
          </div>
        );
      })}
    </div>
  );
}
