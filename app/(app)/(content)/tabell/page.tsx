import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSeasons, getStandingsTable } from "@/lib/football/catalog";
import { FormBadges } from "@/components/data/FormBadges";

/**
 * Fas 14.3 (plans/humble-giggling-biscuit.md) — den riktiga serietabellen.
 * Ersätter det tidigare `disabled: true`/"Kommer snart"-navobjektet
 * (components/nav/Sidebar.tsx) och den tunna rank/points/played-remsan på
 * /lag. Byggd på getStandingsTable (lib/football/catalog.ts, Fas 14.3) som
 * läser den nu dagligen färska `standings`-tabellen (cron, Fas 14.0).
 *
 * Ingen zon-färgläggning (Champions League/Europa/nedflyttning) — de exakta
 * platsantalen för Allsvenskans europaplatser/kval är inte verifierade mot
 * en riktig källa i det här projektet, så en gissad gränslinje hade varit
 * osant självsäker. En ren, rankad tabell är ärligare än fel färgkodning.
 */
export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = season ? Number(season) : seasons[0]?.year;
  const table = seasonYear ? await getStandingsTable(supabase, { season: seasonYear }) : [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Allsvenskan</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Tabell</h1>
      <p className="mt-1 text-sm text-[#898781]">
        {table.length > 0 ? `${table.length} lag` : "Ingen tabelldata"}
        {seasonYear ? `, säsongen ${seasonYear}` : ""}.
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/tabell?season=${s.year}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {table.length === 0 ? (
        <p className="mt-8 text-sm text-[#898781]">Ingen tabelldata för vald säsong.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[#7d7c76]">
                <th className="p-3 text-right">#</th>
                <th className="p-3">Lag</th>
                <th className="p-3 text-right">M</th>
                <th className="p-3 text-right">V</th>
                <th className="p-3 text-right">O</th>
                <th className="p-3 text-right">F</th>
                <th className="p-3 text-right">GM</th>
                <th className="p-3 text-right">IM</th>
                <th className="p-3 text-right">+/-</th>
                <th className="p-3 text-right">P</th>
                <th className="p-3">Form</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.team.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                  <td className="p-3 text-right tabular-nums text-[#898781]">{row.rank}</td>
                  <td className="p-3">
                    <Link
                      href={`/lag/${row.team.external_id ?? row.team.id}${seasonYear ? `?season=${seasonYear}` : ""}`}
                      className="flex items-center gap-2.5 hover:underline"
                    >
                      {row.team.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- extern logga
                        <img src={row.team.logoUrl} alt="" className="h-5 w-5 shrink-0" />
                      ) : (
                        <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                      )}
                      <span className="truncate font-medium text-white">{row.team.name}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.played}</td>
                  <td className="p-3 text-right tabular-nums">{row.win}</td>
                  <td className="p-3 text-right tabular-nums">{row.draw}</td>
                  <td className="p-3 text-right tabular-nums">{row.lose}</td>
                  <td className="p-3 text-right tabular-nums text-[#898781]">{row.goalsFor}</td>
                  <td className="p-3 text-right tabular-nums text-[#898781]">{row.goalsAgainst}</td>
                  <td
                    className="p-3 text-right tabular-nums"
                    style={{ color: row.goalsDiff > 0 ? "#22c55e" : row.goalsDiff < 0 ? "#e66767" : "#898781" }}
                  >
                    {row.goalsDiff > 0 ? "+" : ""}
                    {row.goalsDiff}
                  </td>
                  <td className="p-3 text-right text-base font-semibold tabular-nums text-white">{row.points}</td>
                  <td className="p-3">
                    {row.form ? (
                      <FormBadges
                        form={row.form
                          .split("")
                          .filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L")
                          .slice(-5)}
                      />
                    ) : (
                      <span className="text-xs text-[#7d7c76]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
