interface PlayerStats {
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  passesTotal: number | null;
  passesKey: number | null;
  tacklesTotal: number | null;
  duelsWon: number | null;
  dribblesSuccess: number | null;
}

const ROWS: Array<{ key: keyof PlayerStats; label: string }> = [
  { key: "appearances", label: "Matcher" },
  { key: "minutesPlayed", label: "Minuter" },
  { key: "goals", label: "Mål" },
  { key: "assists", label: "Assist" },
  { key: "rating", label: "Betyg" },
  { key: "shotsTotal", label: "Skott" },
  { key: "shotsOnTarget", label: "På mål" },
  { key: "passesTotal", label: "Passningar" },
  { key: "passesKey", label: "Nyckelpassningar" },
  { key: "tacklesTotal", label: "Tacklingar" },
  { key: "duelsWon", label: "Vunna dueller" },
  { key: "dribblesSuccess", label: "Lyckade dribblingar" },
  { key: "yellowCards", label: "Gula kort" },
  { key: "redCards", label: "Röda kort" },
];

function cell(value: number | null) {
  return value === null ? <span className="text-[#898781]">—</span> : value;
}

/** Statisk jämförelsetabell — högre värde fetstilas, aldrig vid null. */
export function PlayerCompareTable({
  nameA,
  nameB,
  statsA,
  statsB,
}: {
  nameA: string;
  nameB: string;
  statsA: PlayerStats;
  statsB: PlayerStats;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#898781]">
            <th className="pb-2 font-normal"></th>
            <th className="pb-2 pr-4 text-right font-normal">{nameA}</th>
            <th className="pb-2 text-right font-normal">{nameB}</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const a = statsA[row.key];
            const b = statsB[row.key];
            const aHigher = a !== null && b !== null && a > b;
            const bHigher = a !== null && b !== null && b > a;
            return (
              <tr key={row.key} className="border-t border-white/5">
                <td className="py-1.5 text-[#c3c2b7]">{row.label}</td>
                <td className={`py-1.5 pr-4 text-right ${aHigher ? "font-semibold text-white" : "text-[#c3c2b7]"}`}>
                  {cell(a)}
                </td>
                <td className={`py-1.5 text-right ${bHigher ? "font-semibold text-white" : "text-[#c3c2b7]"}`}>
                  {cell(b)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
