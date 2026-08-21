"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { ConfidenceTier } from "@/lib/football/confidence";
import {
  ADVANCED_DNA_CATEGORY_LABELS,
  type AdvancedPlayerDNA as AdvancedPlayerDNAData,
  type AdvancedDNACategory,
  type AdvancedDNACategoryKey,
} from "@/lib/football/advanced-dna";

/**
 * Fas 9 — UI för det avancerade (Sportmonks) DNA-lagret. Speglar
 * components/data/PlayerDNA.tsx:s mönster (samma <details>-baserade
 * "visa min beräkning", samma confidence-badge-princip), men med EN
 * kritisk skillnad: döljs HELT (returnerar null) om profilen inte är
 * tillgänglig — original-PlayerDNA visar en förklarande ruta vid
 * `available:false`, men den regeln gäller INTE här. En spelare utan
 * 2024–2026-täckning (t.ex. slutade spela 2023) ska aldrig se en tom
 * "avancerad DNA saknas"-platshållare, exakt som planen kräver.
 *
 * Egen accentfärg (violett, #a78bfa) — medvetet skild från original-DNA:s
 * blå (#3987e5) så de två lagren aldrig kan förväxlas visuellt, även utan
 * att läsa rubriken. Fullständig visuell polish kommer i en senare fas
 * (Scout UI/UX-lyftet) — det här är en funktionell, inte färdigdesignad, yta.
 */

const ADVANCED_ACCENT = "#a78bfa";

const CONFIDENCE_COLOR: Record<ConfidenceTier, string> = {
  hög: "#22c55e",
  medel: "#d9a526",
  låg: "#e66767",
};

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  hög: "Säker analys",
  medel: "Medelsäker analys",
  låg: "Begränsat underlag",
};

const CATEGORY_KEYS: AdvancedDNACategoryKey[] = [
  "avslutningskvalitet",
  "bollprogression",
  "bollsakerhet",
  "luftspel",
  "bollatervinning",
];

function CategoryDetail({ label, category }: { label: string; category: AdvancedDNACategory }) {
  if (category.score === null) {
    return (
      <div className="flex items-center justify-between py-1.5 text-xs">
        <span className="text-[#7d7c76]">{label}</span>
        <span className="text-[#7d7c76]">Ej tillgängligt</span>
      </div>
    );
  }

  return (
    <details className="py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-xs marker:content-none">
        <span className="flex items-center gap-1.5 text-[#c3c2b7]">
          {label}
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
              category.tier === "primary" ? "text-[#a78bfa]" : "bg-white/5 text-[#7d7c76]"
            }`}
            style={category.tier === "primary" ? { backgroundColor: `${ADVANCED_ACCENT}26` } : undefined}
          >
            {category.tier === "primary" ? "Primär" : "Sekundär"}
          </span>
        </span>
        <span className="font-medium text-white">{category.score}</span>
      </summary>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${ADVANCED_ACCENT}26` }}>
        <div className="h-1.5 rounded-full" style={{ width: `${category.score}%`, backgroundColor: ADVANCED_ACCENT }} />
      </div>
      <div className="mt-2 space-y-1 rounded-lg bg-black/20 p-2 text-[11px] text-[#898781]">
        {category.metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-2">
            <span>
              {m.label}
              {m.lowerIsBetter && <span className="text-[#5f5e59]"> (lägre bättre)</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              {m.playerValue}
              {m.unit}{" "}
              <span className="text-[#5f5e59]">
                (snitt {m.peerAverage}
                {m.unit} · percentil {m.percentile})
              </span>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function AdvancedDNA({ dna, compact = false }: { dna: AdvancedPlayerDNAData; compact?: boolean }) {
  if (!dna.available) return null; // döljs helt — se filhuvudet

  const { categories, confidence, playerType, summary, insights } = dna;
  if (!confidence) return null; // typvakt — available:true garanterar confidence

  const orderedKeys = [
    ...CATEGORY_KEYS.filter((k) => categories[k].tier === "primary"),
    ...CATEGORY_KEYS.filter((k) => categories[k].tier === "secondary"),
  ];
  const radarData = CATEGORY_KEYS.filter((k) => categories[k].score !== null).map((k) => ({
    axis: ADVANCED_DNA_CATEGORY_LABELS[k],
    Percentil: categories[k].score as number,
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Avancerad DNA</h2>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${ADVANCED_ACCENT}26`, color: ADVANCED_ACCENT }}
              title="Baserad på Sportmonks-data, endast tillgänglig för 2024, 2025 och 2026"
            >
              Sportmonks · 2024+
            </span>
          </div>
          {playerType.label ? (
            <p className="mt-1 text-lg font-semibold text-white" title={playerType.reason ?? undefined}>
              {playerType.label}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#898781]">
              {confidence.tier === "låg"
                ? "Otillräckligt underlag för en avancerad spelartyp."
                : "Jämn avancerad profil — ingen tydlig typ sticker ut."}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${CONFIDENCE_COLOR[confidence.tier]}22`, color: CONFIDENCE_COLOR[confidence.tier] }}
          title={`${confidence.ownMinutes} egna minuter (poolat 2024–2026) · jämfört med ${confidence.peerCount} andra ${confidence.peerLabel}`}
        >
          {CONFIDENCE_LABEL[confidence.tier]}
        </span>
      </div>

      {summary && <p className="mt-2 text-sm leading-relaxed text-[#c3c2b7]">{summary}</p>}

      {radarData.length >= 3 ? (
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="#2c2c2a" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "#c3c2b7", fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="Percentil" stroke={ADVANCED_ACCENT} fill={ADVANCED_ACCENT} fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#898781]">
          Väntar på fler jämförbara kategorier för ett diagram (har {radarData.length} av {CATEGORY_KEYS.length}).
        </p>
      )}

      {insights.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7d7c76]">Specifika mönster</p>
          <ul className="space-y-1.5">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#c3c2b7]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: ADVANCED_ACCENT }} aria-hidden />
                {insight.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <div className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
          {orderedKeys.map((key) => (
            <CategoryDetail key={key} label={ADVANCED_DNA_CATEGORY_LABELS[key]} category={categories[key]} />
          ))}
        </div>
      )}
    </div>
  );
}
