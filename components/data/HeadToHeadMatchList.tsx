import { colors } from "@/lib/design/tokens";
import { translateRound } from "@/lib/i18n/sv";

/**
 * Fas 19 — inbördes möten som en scoreboard-lista istället för en löpande
 * textrad per match. Vinnande lag skrivs i grönt + fetstil, förlorande i
 * rött, oavgjort i grått (colors.status.result — SAMMA gröna/röda par som
 * FormBadges och RecordBar:s "form"-läge, så ett resultat aldrig kodas med
 * två olika gröna på samma sida).
 *
 * Färgen bär ALDRIG betydelsen ensam: vinnaren är också fetstilad, och
 * varje rad har en title med utfallet i klartext.
 */

export interface HeadToHeadMatch {
  season: number | null;
  round: string | null;
  status: string;
  home: string | null;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

type Outcome = "home" | "away" | "draw" | "none";

function outcomeOf(m: HeadToHeadMatch): Outcome {
  if (m.status !== "FT" || m.homeScore === null || m.awayScore === null) return "none";
  if (m.homeScore === m.awayScore) return "draw";
  return m.homeScore > m.awayScore ? "home" : "away";
}

function teamStyle(outcome: Outcome, isHome: boolean) {
  if (outcome === "none") return { color: colors.text.dim, weight: "" };
  if (outcome === "draw") return { color: colors.status.result.draw, weight: "" };
  const won = outcome === (isHome ? "home" : "away");
  return {
    color: won ? colors.status.result.win : colors.status.result.loss,
    weight: won ? "font-semibold" : "",
  };
}

export function HeadToHeadMatchList({ matches }: { matches: HeadToHeadMatch[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-[#898781]">Inga inbördes möten i vår data.</p>;
  }

  return (
    <div className="divide-y divide-white/5">
      {matches.map((m, i) => {
        const outcome = outcomeOf(m);
        const home = teamStyle(outcome, true);
        const away = teamStyle(outcome, false);
        const round = translateRound(m.round);
        const result =
          outcome === "none"
            ? "Inte spelad"
            : outcome === "draw"
              ? "Oavgjort"
              : `${outcome === "home" ? m.home : m.away} vann`;
        // Omgången är sällan det man scannar efter — den lever i title:n
        // istället för att kosta en egen rad per match.
        const title = round ? `${result} · ${round}` : result;

        return (
          <div
            key={i}
            title={title}
            className="grid grid-cols-[3.5rem_1fr_auto_1fr] items-center gap-2 px-1 py-2.5 text-xs sm:gap-3"
          >
            <span className="tabular-nums text-[#5f5e59]">{m.season ?? "—"}</span>
            <span className={`truncate text-right ${home.weight}`} style={{ color: home.color }}>
              {m.home ?? "—"}
            </span>
            <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-center text-[13px] font-semibold tabular-nums text-white">
              {m.homeScore ?? "–"}<span className="px-0.5 text-[#5f5e59]">–</span>{m.awayScore ?? "–"}
            </span>
            <span className={`truncate ${away.weight}`} style={{ color: away.color }}>
              {m.away ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
