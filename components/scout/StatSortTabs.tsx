import Link from "next/link";

/**
 * Fas 19f (2026-08-23, användarkrav) — sorteringsknappar för varje lista som
 * visar Matcher/Mål/Assist/Minuter/Snittbetyg.
 *
 * Delad komponent + delad sorteringsfunktion, medvetet: listorna ligger på
 * olika sidor (klubbvyn sorterar SPELARE, spelarvyn sorterar KLUBBAR) men
 * ska bete sig exakt likadant. Ordningen på knapparna följer ordningen på
 * kolumnerna i listorna nedanför dem — annars får man leta.
 *
 * Sorteringen ligger i URL:en (`?sortera=`) precis som Efter Allsvenskan-
 * listans egen sortering, så att ett val överlever länkning och bakåtknappen.
 */
export type StatSortKey = "appearances" | "goals" | "assists" | "minutesPlayed" | "avgRating";

export const STAT_SORT_OPTIONS: { key: StatSortKey; label: string }[] = [
  { key: "appearances", label: "Matcher" },
  { key: "goals", label: "Mål" },
  { key: "assists", label: "Assist" },
  { key: "minutesPlayed", label: "Minuter" },
  { key: "avgRating", label: "Snittbetyg" },
];

export function parseStatSort(value: string | undefined, fallback: StatSortKey = "goals"): StatSortKey {
  return STAT_SORT_OPTIONS.some((o) => o.key === value) ? (value as StatSortKey) : fallback;
}

export interface SortableStats {
  appearances: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  avgRating: number | null;
}

/**
 * Sorterar fallande på valt mått. Rader UTAN betyg hamnar alltid sist när man
 * sorterar på snittbetyg — aldrig blandade bland de lägsta betygen, vilket
 * hade fått "saknas" att se ut som "dåligt". Vid lika värde avgör matcher,
 * så att den med mer underlag hamnar först.
 */
export function sortByStat<T>(rows: T[], key: StatSortKey, pick: (row: T) => SortableStats): T[] {
  return [...rows].sort((a, b) => {
    const sa = pick(a);
    const sb = pick(b);
    if (key === "avgRating") {
      if (sa.avgRating === null && sb.avgRating === null) return sb.appearances - sa.appearances;
      if (sa.avgRating === null) return 1;
      if (sb.avgRating === null) return -1;
      return sb.avgRating - sa.avgRating || sb.appearances - sa.appearances;
    }
    return sb[key] - sa[key] || sb.appearances - sa.appearances;
  });
}

export function StatSortTabs({ current, hrefFor }: { current: StatSortKey; hrefFor: (key: StatSortKey) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] uppercase tracking-wide text-[#7d7c76]">Sortera</span>
      {STAT_SORT_OPTIONS.map((o) => (
        <Link
          key={o.key}
          href={hrefFor(o.key)}
          aria-current={current === o.key ? "true" : undefined}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
            current === o.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:text-white"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
