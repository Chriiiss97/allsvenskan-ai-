"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — EN delad radarbas istället
 * för de fyra separata, handbyggda Recharts-radarn auditen hittade
 * (PlayerRadarChart, PlayerCompareRadar, och de inline-radarn i PlayerDNA/
 * AdvancedDNA), som alla kopierade samma PolarGrid/axel-styling med små,
 * omotiverade skillnader (t.ex. PlayerCompareRadar visade diagram redan
 * från 1 axel, de andra tre krävde minst 3 — en spik ser trasigt ut, inte
 * en "spindel", enligt PlayerRadarChart:s egen kommentar).
 *
 * NY fil, INTE ännu inkopplad någonstans (medvetet, se tokens.ts:s
 * filhuvud för samma resonemang) — de fyra befintliga radarn migreras hit
 * EN i taget när respektive sida ändå byggs om i Fas 14.3+, inte i en
 * bakåtkompatibel storstädning nu.
 *
 * Täcker alla fyra tidigare mönster via props:
 *   - 1 serie, fast domän [0,100], ingen legend (PlayerDNA/AdvancedDNA)
 *   - 2 serier, DYNAMISK domän (domain="auto", PlayerRadarChart)
 *   - 2 serier, fast domän [0,100] (PlayerCompareRadar)
 */

export interface RadarSeriesDef {
  /** Måste matcha en nyckel i varje data-rad. */
  key: string;
  /** Legend-/tooltip-namn. */
  label: string;
  color: string;
  fillOpacity?: number;
  strokeDasharray?: string;
}

export interface RadarChartBaseProps {
  /** En rad per axel: { axis: "Målfarlighet", Spelare: 83, Positionssnitt: 100 }. Använd `null` (aldrig 0) för en serie som saknar data på just den axeln. */
  data: Array<Record<string, string | number | null>>;
  series: RadarSeriesDef[];
  height?: number;
  /** "auto" = dynamisk takhöjd (samma golv-120/1.15-marginal-logik som PlayerRadarChart) — annars ett fast [min, max]. */
  domain?: [number, number] | "auto";
  showLegend?: boolean;
  showTooltip?: boolean;
  /** Siffror på radie-axeln (0/50/100 osv.) — DNA-korten döljer dem medvetet för en renare look, jämförelsediagram visar dem. */
  showRadiusTicks?: boolean;
  /**
   * Suffix i tooltipen (t.ex. "%") — INTE en godtycklig formatter-funktion:
   * en sida som anropar RadarChartBase är nästan alltid en Server Component
   * (samma mönster som resten av appen), och Next.js tillåter inte att en
   * funktion skickas som prop över server→klient-gränsen ("Functions cannot
   * be passed directly to Client Components"). Formateringen sker därför
   * HELT inuti den här klientkomponenten istället för att tas emot utifrån.
   */
  valueSuffix?: string;
  /** Färre axlar än detta → emptyMessage istället för ett diagram (en 1–2-axlig "spindel" ser trasig ut). */
  minAxes?: number;
  emptyMessage?: string;
}

export function RadarChartBase({
  data,
  series,
  height = 260,
  domain = [0, 100],
  showLegend,
  showTooltip,
  showRadiusTicks = false,
  valueSuffix = "",
  minAxes = 3,
  emptyMessage = "Väntar på fler jämförbara mått för ett diagram.",
}: RadarChartBaseProps) {
  const resolvedShowLegend = showLegend ?? series.length > 1;
  const resolvedShowTooltip = showTooltip ?? series.length > 1;

  if (data.length < minAxes) {
    return <p className="text-sm text-[#898781]">{emptyMessage}</p>;
  }

  let resolvedDomain: [number, number];
  if (domain === "auto") {
    const maxValue = Math.max(
      0,
      ...data.flatMap((row) => series.map((s) => (typeof row[s.key] === "number" ? (row[s.key] as number) : 0)))
    );
    // Samma golv-120/1.15-marginal/avrunda-till-20-logik som ursprungliga
    // PlayerRadarChart — ett fast 0–200-tak klämmer ihop diagrammet till en
    // smal remsa när alla riktiga värden ligger runt 100.
    resolvedDomain = [0, Math.max(120, Math.ceil((maxValue * 1.15) / 20) * 20)];
  } else {
    resolvedDomain = domain;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke={colors.border.grid} />
        <PolarAngleAxis dataKey="axis" tick={{ fill: colors.text.secondary, fontSize: 12 }} />
        <PolarRadiusAxis
          domain={resolvedDomain}
          tick={showRadiusTicks ? { fill: colors.text.muted, fontSize: 10 } : false}
          axisLine={false}
        />
        {series.map((s) => (
          <Radar
            key={s.key}
            name={s.label}
            dataKey={s.key}
            stroke={s.color}
            fill={s.color}
            fillOpacity={s.fillOpacity ?? 0.35}
            strokeDasharray={s.strokeDasharray}
          />
        ))}
        {resolvedShowLegend && <Legend wrapperStyle={{ fontSize: 12, color: colors.text.secondary }} />}
        {resolvedShowTooltip && (
          <Tooltip
            contentStyle={{ background: colors.surface.raised, border: `1px solid ${colors.border.grid}`, borderRadius: 8 }}
            labelStyle={{ color: colors.text.primary }}
            formatter={(value) => `${Math.round(Number(value))}${valueSuffix}`}
          />
        )}
      </RadarChart>
    </ResponsiveContainer>
  );
}
