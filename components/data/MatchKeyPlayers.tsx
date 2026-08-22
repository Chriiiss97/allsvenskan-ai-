import { colors } from "@/lib/design/tokens";
import type { KeyPlayerCategory } from "@/lib/football/match-key-players";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

/**
 * Fas 16d (2026-08-22) — "Nyckelspelare". Varje kategori svarar på EN
 * konkret fråga (vem har störst målhot? bäst betyg?) istället för att visa
 * en grid av 12 löskopplade siffror. Ledaren är huvudobjektet (namn, lag,
 * stort tal, en kort förklaringsrad); jämförelsestapeln under visar samma
 * mått för de närmaste konkurrenterna på EN skala (aldrig blandat mot ett
 * annat mått) så skillnaden syns direkt, inte bara läses.
 */
function CategoryCard({ category }: { category: KeyPlayerCategory }) {
  const maxValue = category.contenders[0].value;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#898781]">
        <span aria-hidden>{category.icon}</span> {category.title}
      </p>

      <p className="mt-2.5 text-lg font-bold text-white">{category.leader.name}</p>
      <p className="text-xs text-[#7d7c76]">
        {category.leader.subject}
        {category.leader.isH2H ? " · H2H" : ""}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums text-white">{fmt(category.leader.value)}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-[#898781]">{category.unit}</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[#898781]">{category.caption}</p>

      {category.contenders.length > 1 && (
        <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
          {category.contenders.map((c) => (
            <div key={`${c.name}-${c.subject}`} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-[11px] text-[#c3c2b7]">{c.name}</span>
              <div className="h-1.5 flex-1 rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(4, (c.value / maxValue) * 100)}%`, backgroundColor: colors.accent.matchPreview }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[#898781]">{fmt(c.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchKeyPlayers({ categories }: { categories: KeyPlayerCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {categories.map((c) => (
        <CategoryCard key={c.key} category={c} />
      ))}
    </div>
  );
}
