import Link from "next/link";
import { getCachedSeasons, getCachedTeams, getCachedScoutSearch } from "@/lib/football/cached-reads";
import { SEARCHABLE_METRICS, type ScoutSearchCriterion } from "@/lib/football/scout/scout-search";
import { translatePosition } from "@/lib/i18n/sv";
import type { PositionGroupKey } from "@/lib/football/position-group";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scout Search. Riktig
 * kriterie-sökning: position + ålder + valfritt antal mått-trösklar (både
 * råvärde OCH percentil, t.ex. "xG/90 ≥ 0.20" respektive "Bollåtervinningar
 * ≥ 80:e percentilen") — se lib/football/scout/scout-search.ts för hela
 * motorn och varför den bygger på redan existerande, tidigare oanvänd
 * Fas 11-kod.
 */

const POSITION_GROUPS: { key: Exclude<PositionGroupKey, "goalkeeper">; label: string }[] = [
  { key: "defender", label: "Försvarare" },
  { key: "midfielder", label: "Mittfältare" },
  { key: "attacker", label: "Anfallare" },
];

export default async function ScoutSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // Säsonger och lag beror inte på varandra — hämtas i samma våg, båda cachade.
  const [seasons, teams] = await Promise.all([getCachedSeasons(), getCachedTeams()]);
  const seasonYear = sp.season ? Number(sp.season) : seasons[0]?.year;
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const positionGroup = POSITION_GROUPS.some((p) => p.key === sp.position) ? (sp.position as (typeof POSITION_GROUPS)[number]["key"]) : undefined;
  const ageMin = sp.ageMin ? Number(sp.ageMin) : undefined;
  const ageMax = sp.ageMax ? Number(sp.ageMax) : undefined;

  const criteria: ScoutSearchCriterion[] = [];
  for (const metric of SEARCHABLE_METRICS) {
    const minValue = sp[`m_${metric.key}_val`] ? Number(sp[`m_${metric.key}_val`]) : undefined;
    const minPercentile = sp[`m_${metric.key}_pct`] ? Number(sp[`m_${metric.key}_pct`]) : undefined;
    if (minValue !== undefined || minPercentile !== undefined) {
      criteria.push({ metricKey: metric.key, minValue, minPercentile });
    }
  }

  const seasonRow = seasonYear ? seasons.find((s) => s.year === seasonYear) : undefined;
  const results = seasonRow
    ? await getCachedScoutSearch({ seasonId: seasonRow.id, positionGroup, ageMin, ageMax, criteria })
    : [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Sök</h1>
      <p className="mt-1 max-w-xl text-sm text-[#898781]">
        Kombinera position, ålder och Sportmonks-mått (råvärde eller percentil bland samma positionsgrupp) för att hitta
        spelartyper — inte bara bläddra.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/scout/search?${new URLSearchParams({ ...sp, season: String(s.year) } as Record<string, string>).toString()}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      <form method="get" className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-4">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[#898781]">
            Position
            <select name="position" defaultValue={positionGroup ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
              <option value="">Alla utespelare</option>
              {POSITION_GROUPS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#898781]">
            Ålder min
            <input type="number" name="ageMin" defaultValue={sp.ageMin ?? ""} className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#898781]">
            Ålder max
            <input type="number" name="ageMax" defaultValue={sp.ageMax ?? ""} className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
          </label>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
            Mått-trösklar (minst 450 spelade minuter, jämfört mot samma positionsgrupp)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEARCHABLE_METRICS.map((metric) => (
              <div key={metric.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-medium text-white" title={metric.definition}>
                  {metric.label} <span className="text-[#7d7c76]">({metric.unit})</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-[#898781]">
                    Min. råvärde
                    <input
                      type="number"
                      step="0.1"
                      name={`m_${metric.key}_val`}
                      defaultValue={sp[`m_${metric.key}_val`] ?? ""}
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-[#898781]">
                    Min. percentil
                    <input
                      type="number"
                      min={0}
                      max={100}
                      name={`m_${metric.key}_pct`}
                      defaultValue={sp[`m_${metric.key}_pct`] ?? ""}
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                    />
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-[#5f5e59]">Täckning: {metric.coverageNote}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="rounded-md bg-[#a78bfa] px-4 py-2 text-sm font-medium text-black">
            Sök
          </button>
          {(positionGroup || ageMin || ageMax || criteria.length > 0) && (
            <Link href={`/scout/search?season=${seasonYear ?? ""}`} className="text-xs text-[#898781] hover:text-white">
              Rensa filter
            </Link>
          )}
        </div>
      </form>

      <div className="mt-6">
        {criteria.length === 0 ? (
          <p className="text-sm text-[#898781]">Lägg till minst en mått-tröskel ovan för att söka.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-[#898781]">Ingen spelare matchar alla kriterier.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-[#898781]">{results.length} spelare matchar</p>
            <div className="flex flex-col gap-2">
              {results.slice(0, 50).map((r) => (
                <Link
                  key={r.playerId}
                  href={`/scout/spelare/${r.playerId}?season=${seasonYear}`}
                  className="flex flex-col gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{r.fullName}</p>
                    <p className="text-xs text-[#898781]">
                      {teamById.get(r.teamId)?.name ?? "—"} · {translatePosition(r.position ?? "")} · {r.age ?? "—"} år
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.matches.map((m) => (
                      <span key={m.metricKey} className="rounded-full bg-[#a78bfa]/15 px-2 py-0.5 text-[11px] text-[#a78bfa]">
                        {m.label}: {m.value} (p{m.percentile})
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
