import Link from "next/link";
import type { StandingsTableRow } from "@/lib/football/catalog";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 21 (2026-08-23) — hela ligatabellen på matchens Tabell-flik.
 *
 * Fliken visade tidigare bara de två lagens placering som två kort. Det
 * svarar på "vilken plats?" men inte på den fråga man faktiskt ställer när
 * man tittar på en match: hur ser det ut RUNT dem — vem är närmast, hur
 * långt är det till kvalstrecket. Hela tabellen med de två matchlagen
 * markerade svarar på båda.
 *
 * Tabellen scrollar i sidled i sin EGEN behållare på små skärmar; sidan
 * själv får aldrig en vågrät scroll.
 */

/** Formsträngen från API:t är "WDLWW" — översätts till svenska V/O/F. */
const FORM_LABELS: Record<string, { label: string; color: string; title: string }> = {
  W: { label: "V", color: colors.status.result.win, title: "Vinst" },
  D: { label: "O", color: colors.status.result.draw, title: "Oavgjort" },
  L: { label: "F", color: colors.status.result.loss, title: "Förlust" },
};

function FormRun({ form }: { form: string | null }) {
  if (!form) return null;
  // Senaste fem, nyast sist (samma ordning som resten av appens formvyer).
  const runs = form.slice(-5).split("");
  return (
    <span className="flex gap-0.5">
      {runs.map((r, i) => {
        const meta = FORM_LABELS[r];
        if (!meta) return null;
        return (
          <span
            key={i}
            title={meta.title}
            className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-bold text-black"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}

export function MatchStandingsTable({
  rows,
  highlightTeamIds,
}: {
  rows: StandingsTableRow[];
  highlightTeamIds: number[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#898781]">Ingen tabell sparad för den här säsongen.</p>;
  }

  const highlight = new Set(highlightTeamIds);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[540px] border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#7d7c76]">
            <th className="w-8 py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Lag</th>
            <th className="w-10 py-2 text-right font-medium" title="Spelade matcher">SP</th>
            <th className="w-8 py-2 text-right font-medium" title="Vinster">V</th>
            <th className="w-8 py-2 text-right font-medium" title="Oavgjorda">O</th>
            <th className="w-8 py-2 text-right font-medium" title="Förluster">F</th>
            <th className="w-14 py-2 text-right font-medium" title="Målskillnad">+/−</th>
            <th className="w-10 py-2 text-right font-medium" title="Poäng">P</th>
            <th className="w-24 py-2 pl-4 text-left font-medium">Form</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => {
            const isHighlighted = highlight.has(row.team.id);
            return (
              <tr key={row.team.id} className={isHighlighted ? "bg-white/[0.06]" : undefined}>
                <td className="py-2.5 text-left tabular-nums text-[#898781]">{row.rank}</td>
                <td className="py-2.5">
                  <Link href={`/lag/${row.team.id}`} className="flex items-center gap-2 transition-colors hover:text-white">
                    {row.team.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- extern logga
                      <img src={row.team.logoUrl} alt="" className="h-5 w-5 shrink-0" />
                    ) : (
                      <span className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                    )}
                    <span className={`truncate ${isHighlighted ? "font-semibold text-white" : "text-[#c3c2b7]"}`}>{row.team.name}</span>
                  </Link>
                </td>
                <td className="py-2.5 text-right tabular-nums text-[#898781]">{row.played}</td>
                <td className="py-2.5 text-right tabular-nums text-[#898781]">{row.win}</td>
                <td className="py-2.5 text-right tabular-nums text-[#898781]">{row.draw}</td>
                <td className="py-2.5 text-right tabular-nums text-[#898781]">{row.lose}</td>
                <td className="py-2.5 text-right tabular-nums text-[#898781]">
                  {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums text-white">{row.points}</td>
                <td className="py-2.5 pl-4">
                  <FormRun form={row.form} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
