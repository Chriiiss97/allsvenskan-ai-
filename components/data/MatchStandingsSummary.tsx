import { colors } from "@/lib/design/tokens";

export interface TeamStandingLite {
  rank: number;
  points: number;
  played: number;
  goalsDiff: number;
  /** Senaste 5, äldst→nyast (t.ex. "WWDLW") — samma sträng som standings.form, oförändrad. */
  form: string | null;
}

const RESULT_COLOR: Record<string, string> = {
  W: colors.status.result.win,
  D: colors.status.result.draw,
  L: colors.status.result.loss,
};

/**
 * Fas 17 (2026-08-22) — "var står lagen i tabellen just nu", oberoende av
 * Sportmonks match-facts (samma standings-tabell /tabell redan visar, se
 * lib/football/catalog.ts:s getStandingsTable). Finns alltså för i princip
 * ALLA matcher, inklusive kommande — säsongstabellen är alltid färsk
 * (uppdateras dagligen av cron/finalize). Ett lag utan tabellrad för
 * säsongen (extremt sällsynt) visas bara som "–", aldrig en påhittad rank.
 */
export function MatchStandingsSummary({
  home,
  away,
  homeName,
  awayName,
}: {
  home: TeamStandingLite | null;
  away: TeamStandingLite | null;
  homeName: string;
  awayName: string;
}) {
  if (!home && !away) return null;

  return (
    <div className="grid grid-cols-2 gap-6 sm:gap-10">
      {[
        { name: homeName, standing: home, color: colors.compare.a },
        { name: awayName, standing: away, color: colors.compare.b },
      ].map(({ name, standing, color }) => (
        <div key={name}>
          <p className="truncate text-xs font-medium text-white">{name}</p>
          {standing ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums sm:text-4xl" style={{ color }}>
                  {standing.rank}
                </span>
                <span className="text-xs text-[#7d7c76]">plats</span>
              </div>
              <p className="mt-1.5 text-xs text-[#898781]">
                <span className="font-semibold tabular-nums text-white">{standing.points}</span> poäng ·{" "}
                <span className="tabular-nums">{standing.played}</span> matcher ·{" "}
                <span className="tabular-nums">
                  {standing.goalsDiff > 0 ? "+" : ""}
                  {standing.goalsDiff}
                </span>{" "}
                mv
              </p>
              {standing.form && (
                <div className="mt-2 flex gap-1">
                  {standing.form.split("").map((r, i) => (
                    <span
                      key={i}
                      className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                      style={{ backgroundColor: `${RESULT_COLOR[r] ?? colors.text.faint}26`, color: RESULT_COLOR[r] ?? colors.text.faint }}
                      title={r === "W" ? "Vinst" : r === "D" ? "Oavgjort" : r === "L" ? "Förlust" : r}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-[#5f5e59]">Ingen tabelldata</p>
          )}
        </div>
      ))}
    </div>
  );
}
