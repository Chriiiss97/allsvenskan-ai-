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

interface AxisDef {
  key: keyof Per90Stats;
  label: string;
}

const AXES: AxisDef[] = [
  { key: "goals", label: "Målfarlighet" },
  { key: "passesKey", label: "Skapande" },
  { key: "passesTotal", label: "Passningsspel" },
  { key: "duelsWon", label: "Duellspel" },
  { key: "tacklesTotal", label: "Försvarsarbete" },
];

/**
 * Två serier (kategoriska slot 1 blue = spelaren, slot 2 orange =
 * ligasnitt), värden uttryckta som % av ligasnitt (100 = snittet bland
 * IFK/AIK-spelare den här säsongen) — INTE ett påhittat "DNA"-index, bara
 * en normaliserad vy av redan uträknade per-90-tal så axlarna blir
 * jämförbara på samma skala. En axel som saknar data för spelaren tas bort
 * helt istället för att visas som 0.
 */
export function PlayerRadarChart({
  per90,
  leagueAveragePer90,
}: {
  per90: Per90Stats;
  leagueAveragePer90: Per90Stats;
}) {
  const data = AXES.map((axis) => {
    const playerValue = per90[axis.key];
    const avgValue = leagueAveragePer90[axis.key];
    const pct = playerValue !== null && avgValue ? Math.min(200, (playerValue / avgValue) * 100) : null;
    return { axis: axis.label, Spelare: pct, Ligasnitt: pct !== null ? 100 : null };
  }).filter((d) => d.Spelare !== null);

  if (data.length === 0) {
    return <p className="text-sm text-[#898781]">Inte tillräckligt med data för ett diagram än.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-xs text-[#898781]">
        100 = snitt bland IFK/AIK-spelare den här säsongen (inte hela Allsvenskan)
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="#2c2c2a" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#c3c2b7", fontSize: 12 }} />
          <PolarRadiusAxis
            domain={[0, 200]}
            tick={{ fill: "#898781", fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Spelare"
            dataKey="Spelare"
            stroke="#3987e5"
            fill="#3987e5"
            fillOpacity={0.35}
          />
          <Radar
            name="Ligasnitt"
            dataKey="Ligasnitt"
            stroke="#d95926"
            fill="#d95926"
            fillOpacity={0.1}
            strokeDasharray="4 3"
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#c3c2b7" }} />
          <Tooltip
            contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8 }}
            labelStyle={{ color: "#ffffff" }}
            formatter={(value) => `${Math.round(Number(value))}%`}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
