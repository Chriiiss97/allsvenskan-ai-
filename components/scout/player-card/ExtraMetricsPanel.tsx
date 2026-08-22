import type { PlayerCardExtraMetrics } from "@/lib/football/rating/player-card-extra-metrics";

/**
 * Fas 15 (Complete Scout Player Card) — de idag oanvända Sportmonks-fälten
 * (se lib/football/rating/player-card-extra-metrics.ts). Rå säsongsvolym,
 * INGA percentiler ännu (litet, overifierat underlag för en peer-jämförelse
 * på just de här fälten) — bara ärliga säsongstal, döljer sig helt om
 * spelaren saknar täckning.
 */
function per90(value: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round(((value / minutes) * 90 + Number.EPSILON) * 10) / 10;
}

export function ExtraMetricsPanel({ data }: { data: PlayerCardExtraMetrics | null }) {
  if (!data) return null;
  const hasAny =
    data.bigChancesCreated > 0 ||
    data.bigChancesMissed > 0 ||
    data.totalCrosses > 0 ||
    data.hitWoodwork > 0 ||
    data.manOfMatchCount > 0;
  if (!hasAny) return null;

  const rows: { label: string; value: string }[] = [];
  if (data.bigChancesCreated > 0) rows.push({ label: "Stora chanser skapade", value: `${data.bigChancesCreated} (${per90(data.bigChancesCreated, data.minutesPlayed)}/90)` });
  if (data.bigChancesMissed > 0) rows.push({ label: "Stora chanser missade", value: String(data.bigChancesMissed) });
  if (data.totalCrosses > 0)
    rows.push({
      label: "Inlägg",
      value: `${data.accurateCrosses}/${data.totalCrosses} (${Math.round((data.accurateCrosses / data.totalCrosses) * 100)}%)`,
    });
  if (data.hitWoodwork > 0) rows.push({ label: "Ramträffar", value: String(data.hitWoodwork) });
  if (data.manOfMatchCount > 0) rows.push({ label: "Bästa spelare (matcher)", value: String(data.manOfMatchCount) });

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <h2 className="text-sm font-semibold">Övrigt (Sportmonks, 2024+)</h2>
      <p className="mb-2 mt-0.5 text-[11px] text-[#898781]">Säsongstotaler — inga percentiler ännu, för litet verifierat underlag.</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-[#c3c2b7]">{r.label}</span>
            <span className="font-medium tabular-nums text-white">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
