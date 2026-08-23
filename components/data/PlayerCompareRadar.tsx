import { RadarChartBase } from "@/components/charts/RadarChartBase";
import { colors } from "@/lib/design/tokens";

interface Per90Stats {
  goals: number | null;
  passesKey: number | null;
  passesTotal: number | null;
  duelsWon: number | null;
  tacklesTotal: number | null;
}

const AXES: Array<{ key: keyof Per90Stats; label: string }> = [
  { key: "goals", label: "Målfarlighet" },
  { key: "passesKey", label: "Skapande" },
  { key: "passesTotal", label: "Passningsspel" },
  { key: "duelsWon", label: "Duellspel" },
  { key: "tacklesTotal", label: "Försvarsarbete" },
];

/**
 * Jämför två spelare direkt (inte mot ligasnitt) — per axel sätts ledaren
 * till 100% och den andra spelaren visas relativt mot ledaren. En axel tas
 * bort helt om NÅGON av spelarna saknar data för den (aldrig 0 för null).
 *
 * Fas 19: migrerad till den delade RadarChartBase (den migrering
 * components/charts/RadarChartBase.tsx:s filhuvud förberedde för — "en i
 * taget när respektive sida ändå byggs om"). Två synliga följder, båda
 * avsiktliga: serierna använder nu sidans delade jämförelsefärger
 * (colors.compare) istället för egna hex-literaler, och diagrammet kräver
 * minst 3 axlar — en 1–2-axlig "spindel" ser trasig ut, samma regel som
 * appens övriga radar redan följde.
 */
export function PlayerCompareRadar({
  nameA,
  nameB,
  per90A,
  per90B,
}: {
  nameA: string;
  nameB: string;
  per90A: Per90Stats;
  per90B: Per90Stats;
}) {
  const data = AXES.map((axis) => {
    const a = per90A[axis.key];
    const b = per90B[axis.key];
    if (a === null || b === null) return null;
    const base = Math.max(a, b) || 1;
    return { axis: axis.label, a: Math.round((a / base) * 100), b: Math.round((b / base) * 100) };
  }).filter((d) => d !== null);

  return (
    <RadarChartBase
      data={data}
      series={[
        { key: "a", label: nameA, color: colors.compare.a, fillOpacity: 0.35 },
        { key: "b", label: nameB, color: colors.compare.b, fillOpacity: 0.25 },
      ]}
      height={280}
      domain={[0, 100]}
      valueSuffix="%"
      emptyMessage="Inte tillräckligt med gemensam data för ett diagram."
    />
  );
}
