/**
 * Meter/progress-bar: fyllning = spelarens värde, ljusare steg av samma
 * ramp = spårets bakgrund, en markör visar peer-snittet (se dataviz-skillens
 * palette.md "Meter"-spec). `peerLabel` namnger VAD markören visar snitt för
 * (t.ex. "Snitt anfallare") — aldrig ett hårdkodat "ligasnitt", eftersom
 * jämförelsen är positionsspecifik (se lib/football/position-group.ts).
 * Renderar INGET alls om värdet saknas — en synlig "Ej tillgängligt"-rad såg
 * trasig/amatörmässig ut och tillförde inget; bättre att panelen bara
 * innehåller de mått vi faktiskt har (se anropsställena, som räknar ut om en
 * hel panel ska visas överhuvudtaget).
 */
export function StatBar({
  label,
  value,
  peerAverage,
  peerLabel = "Snitt",
  suffix = "",
}: {
  label: string;
  value: number | null;
  peerAverage: number | null;
  peerLabel?: string;
  suffix?: string;
}) {
  if (value === null) return null;

  const max = Math.max(value, peerAverage ?? 0) * 1.25 || 1;
  const fillPct = Math.min(100, (value / max) * 100);
  const markerPct = peerAverage !== null ? Math.min(100, (peerAverage / max) * 100) : null;

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#c3c2b7]">{label}</span>
        <span className="font-medium text-white">
          {value}
          {suffix}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-[#3987e5]/15">
        <div
          className="h-2 rounded-full bg-[#3987e5]"
          style={{ width: `${fillPct}%` }}
        />
        {markerPct !== null && (
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-[#d95926]"
            style={{ left: `${markerPct}%` }}
            title={`${peerLabel}: ${peerAverage}${suffix}`}
          />
        )}
      </div>
    </div>
  );
}
