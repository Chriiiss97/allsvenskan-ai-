"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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
    return { axis: axis.label, [nameA]: Math.round((a / base) * 100), [nameB]: Math.round((b / base) * 100) };
  }).filter((d) => d !== null);

  if (data.length === 0) {
    return <p className="text-sm text-[#898781]">Inte tillräckligt med gemensam data för ett diagram.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#2c2c2a" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "#c3c2b7", fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#898781", fontSize: 10 }} axisLine={false} />
        <Radar name={nameA} dataKey={nameA} stroke="#3987e5" fill="#3987e5" fillOpacity={0.35} />
        <Radar name={nameB} dataKey={nameB} stroke="#d95926" fill="#d95926" fillOpacity={0.25} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#c3c2b7" }} />
        <Tooltip
          contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8 }}
          labelStyle={{ color: "#ffffff" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
