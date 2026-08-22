import { colors } from "@/lib/design/tokens";

export interface FormRecord {
  wins: number;
  draws: number;
  losses: number;
  played: number;
  form: Array<"W" | "D" | "L">;
}

const RESULT_COLOR: Record<"W" | "D" | "L", string> = {
  W: colors.status.result.win,
  D: colors.status.result.draw,
  L: colors.status.result.loss,
};

/**
 * Fas 16c (2026-08-22) — "SENASTE 5" som en riktig resultatsekvens (W/D/L,
 * kronologisk ordning) istället för Sportmonks aggregerade sviter ("vunnit
 * 12 av 15"). Bygger på RIKTIG matchdata (fixture.home_score/away_score via
 * lib/football/tools.ts:s getRecentFormSequence), inte Sportmonks — de
 * senare ger bara ANTAL, aldrig i vilken ORDNING matcherna gick.
 */
export function MatchFormSequence({ teamName, record }: { teamName: string; record: FormRecord }) {
  if (record.played === 0) return null;
  const noLossPct = Math.round(((record.wins + record.draws) / record.played) * 100);

  return (
    <div>
      <p className="truncate text-xs font-medium text-white">{teamName}</p>
      <div className="mt-2 flex gap-1.5">
        {record.form.map((r, i) => (
          <span
            key={i}
            className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
            style={{ backgroundColor: `${RESULT_COLOR[r]}26`, color: RESULT_COLOR[r] }}
            title={r === "W" ? "Vinst" : r === "D" ? "Oavgjort" : "Förlust"}
          >
            {r}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex items-baseline gap-3 text-xs text-[#898781]">
        <span>
          <span className="font-semibold text-white">
            {record.wins}/{record.played}
          </span>{" "}
          vinster
        </span>
        <span>
          <span className="font-semibold text-white">{noLossPct} %</span> utan förlust
        </span>
      </div>
    </div>
  );
}
