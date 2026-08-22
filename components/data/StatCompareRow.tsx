import { colors } from "@/lib/design/tokens";

/**
 * Fas 16e (2026-08-22) — Lagstatistik-rad med samma visuella språk som
 * Jämfört med ligasnittet/Inbördes möten: en delad stapel (samma
 * blå/orange lag-par som H2H-sammanfattningen, colors.compare) under
 * siffrorna, inte bara två tal och en etikett.
 */
export function StatCompareRow({
  label,
  home,
  away,
  suffix,
}: {
  label: string;
  home: number | string | null;
  away: number | string | null;
  suffix?: string;
}) {
  const homeNum = typeof home === "number" ? home : null;
  const awayNum = typeof away === "number" ? away : null;
  const total = (homeNum ?? 0) + (awayNum ?? 0);
  const homePct = total > 0 ? ((homeNum ?? 0) / total) * 100 : 0;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="w-16 font-semibold tabular-nums text-white">
          {home ?? "–"}
          {home !== null ? (suffix ?? "") : ""}
        </span>
        <span className="flex-1 text-center text-xs text-[#898781]">{label}</span>
        <span className="w-16 text-right font-semibold tabular-nums text-white">
          {away ?? "–"}
          {away !== null ? (suffix ?? "") : ""}
        </span>
      </div>
      {homeNum !== null && awayNum !== null && total > 0 && (
        <div className="mt-2 flex h-1 gap-0.5 overflow-hidden rounded-full">
          <div className="h-full rounded-full" style={{ width: `${homePct}%`, backgroundColor: colors.compare.a }} />
          <div className="h-full rounded-full" style={{ width: `${100 - homePct}%`, backgroundColor: colors.compare.b }} />
        </div>
      )}
    </div>
  );
}
