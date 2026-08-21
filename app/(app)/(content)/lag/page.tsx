import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSeasons, listTeamsWithSeasonSummary } from "@/lib/football/catalog";
import { SectionTabs } from "@/components/data/SectionTabs";
import { getTeamAccent } from "@/lib/data/team-colors";

/**
 * Data-sektionens breddning (2026-08-20): lagöversikt över alla 33 lag
 * (tidigare en toggle mellan bara IFK Göteborg/AIK). Enskilt-lag-vyn (record,
 * DNA, trupp, historik) flyttad till /lag/[id] (tidigare /data/teams/[id],
 * Fas 14.1 — ren URL-flytt, se plans/humble-giggling-biscuit.md).
 */
export default async function TeamsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const selectedSeason = seasonParam ? Number(seasonParam) : (seasons[0]?.year ?? undefined);
  const teams = await listTeamsWithSeasonSummary(supabase, { season: selectedSeason });

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Alla lag", href: "/lag" },
          { label: "Lag vs lag", href: "/lag/compare" },
        ]}
      />

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Lagstatistik</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Alla lag</h1>
        <p className="mt-1 text-sm text-[#898781]">{teams.length} lag i Allsvenskan, 2016–2026.</p>
      </div>

      {/* Säsongsväljare — styr tabellplacering i grid:en nedan */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/lag?season=${s.year}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedSeason === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
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
              href={`/lag/${t.external_id ?? t.id}${selectedSeason ? `?season=${selectedSeason}` : ""}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 border-l-2 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
              style={{ borderLeftColor: accent }}
            >
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={t.logoUrl} alt="" className="h-9 w-9 shrink-0" />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-full bg-white/5" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                {t.rank !== null ? (
                  <p className="mt-0.5 text-xs text-[#898781]">
                    #{t.rank} · {t.points} p · {t.played} matcher
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-[#7d7c76]">Ingen tabelldata för vald säsong</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
