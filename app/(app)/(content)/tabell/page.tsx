import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSeasons } from "@/lib/football/catalog";
import { getStandingsView, type StandingsFilter } from "@/lib/football/standings-views";
import { FormBadges } from "@/components/data/FormBadges";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 14.3 (plans/humble-giggling-biscuit.md) — den riktiga serietabellen.
 * Fas 17 (2026-08-22) — utökad med flikar (Alla/Hemma/Borta/Senaste 5
 * matcherna/xG) och zonfärgläggning, efter en referensbild (FotMob) från
 * användaren. Se lib/football/standings-views.ts:s filhuvud för hur varje
 * flik räknas (alltid på RIKTIGA, redan importerade matcher/xG-tal —
 * aldrig en påhittad modell).
 *
 * Zonerna (Champions League-kval/Kval till Conference League/Kvalmatch/
 * Degradering) visas BARA på "Alla"-fliken — den är den EGENTLIGA,
 * officiella tabellen. De andra fyra flikarna är hypotetiska
 * omsorteringar (bara hemmamatcher, bara senaste 5, osv.) och skulle ge en
 * missvisande signal om en zonfärg antydde att laget faktiskt ligger i den
 * zonen baserat på t.ex. bara hemmaform.
 */

const FILTERS: { key: StandingsFilter; label: string }[] = [
  { key: "alla", label: "Alla" },
  { key: "hemma", label: "Hemma" },
  { key: "borta", label: "Borta" },
  { key: "senaste5", label: "Senaste 5 matcherna" },
  { key: "xg", label: "xG" },
];

const ZONES: { minRank: number; maxRank: number; color: string; label: string }[] = [
  { minRank: 1, maxRank: 1, color: "#eab308", label: "Champions League kval" },
  { minRank: 2, maxRank: 3, color: "#38bdf8", label: "Kval till Conference League" },
  { minRank: 14, maxRank: 14, color: "#f97316", label: "Kvalmatch" },
  { minRank: 15, maxRank: 16, color: colors.status.result.loss, label: "Degradering" },
];

function zoneForRank(rank: number) {
  return ZONES.find((z) => rank >= z.minRank && rank <= z.maxRank) ?? null;
}

function isValidFilter(value: string | undefined): value is StandingsFilter {
  return FILTERS.some((f) => f.key === value);
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; filter?: string }>;
}) {
  const { season, filter: filterParam } = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = season ? Number(season) : seasons[0]?.year;
  const filter: StandingsFilter = isValidFilter(filterParam) ? filterParam : "alla";
  const table = seasonYear ? await getStandingsView(supabase, { season: seasonYear, filter }) : [];
  const isXg = filter === "xg";

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
            href={`/tabell?season=${s.year}${filter !== "alla" ? `&filter=${filter}` : ""}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {/* Fas 17 — filterflikar. Egen rad, tydligt skild från säsongsväljaren
          ovan (två olika slags urval: VILKEN säsong vs VILKET underlag inom
          den säsongen). */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/tabell?season=${seasonYear}${f.key !== "alla" ? `&filter=${f.key}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:text-white"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {table.length === 0 ? (
        <p className="mt-8 text-sm text-[#898781]">Ingen tabelldata för vald säsong{filter !== "alla" ? " och urval" : ""}.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[#7d7c76]">
                <th className="p-3 text-right">#</th>
                <th className="p-3">Lag</th>
                <th className="p-3 text-right">SP</th>
                <th className="p-3 text-right">V</th>
                <th className="p-3 text-right">O</th>
                <th className="p-3 text-right">F</th>
                <th className="p-3 text-right">{isXg ? "xG" : "+/-"}</th>
                <th className="p-3 text-right">MS</th>
                <th className="p-3 text-right">P</th>
                <th className="p-3">Form</th>
                <th className="p-3">Nästa</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => {
                const zone = filter === "alla" ? zoneForRank(row.rank) : null;
                return (
                  <tr
                    key={row.team.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[.02]"
                    style={zone ? { boxShadow: `inset 3px 0 0 0 ${zone.color}` } : undefined}
                  >
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
                    <td className="p-3 text-right tabular-nums text-[#898781]">
                      {row.goalsFor}–{row.goalsAgainst}
                    </td>
                    <td
                      className="p-3 text-right tabular-nums"
                      style={{ color: row.goalsDiff > 0 ? "#22c55e" : row.goalsDiff < 0 ? "#e66767" : "#898781" }}
                    >
                      {row.goalsDiff > 0 ? "+" : ""}
                      {row.goalsDiff}
                    </td>
                    <td className="p-3 text-right text-base font-semibold tabular-nums text-white">{row.points}</td>
                    <td className="p-3">{row.form && row.form.length > 0 ? <FormBadges form={row.form} /> : <span className="text-xs text-[#7d7c76]">—</span>}</td>
                    <td className="p-3">
                      {row.nextOpponent ? (
                        <Link href={`/lag/${row.nextOpponent.id}${seasonYear ? `?season=${seasonYear}` : ""}`} title={row.nextOpponent.name}>
                          {row.nextOpponent.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- extern logga
                            <img src={row.nextOpponent.logoUrl} alt={row.nextOpponent.name} className="h-5 w-5 shrink-0" />
                          ) : (
                            <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs text-[#5f5e59]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filter === "alla" && table.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[#898781]">
          {ZONES.map((z) => (
            <span key={z.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: z.color }} aria-hidden />
              {z.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
