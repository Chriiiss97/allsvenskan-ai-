import Link from "next/link";
import { getCachedSeasons, getCachedTeams } from "@/lib/football/cached-reads";
import { getTeamAccent } from "@/lib/data/team-colors";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scouts laglista, tunn
 * ingång till /scout/lag/[id] (Lag-DNA, flyttad hit från f.d. /lag/[id]s
 * Statistik-flik). Ingen tabellplacering här — det hör hemma på gratis
 * /tabell, inte i Scout.
 */
export default async function ScoutTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  // Två oberoende, cachade katalogfrågor — i samma våg istället för i kö.
  const [seasons, teams] = await Promise.all([getCachedSeasons(), getCachedTeams()]);
  const seasonYear = season ? Number(season) : seasons[0]?.year;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Lag</h1>
      <p className="mt-1 text-sm text-[#898781]">Lag-DNA — spelstil jämfört med ligasnittet.</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/scout/lag?season=${s.year}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {teams.map((t) => {
          const accent = getTeamAccent(t.external_id);
          return (
            <Link
              key={t.id}
              href={`/scout/lag/${t.external_id ?? t.id}${seasonYear ? `?season=${seasonYear}` : ""}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 border-l-2 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
              style={{ borderLeftColor: accent }}
            >
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={t.logoUrl} alt="" className="h-9 w-9 shrink-0" />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-full bg-white/5" aria-hidden />
              )}
              <p className="truncate text-sm font-medium">{t.name}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
