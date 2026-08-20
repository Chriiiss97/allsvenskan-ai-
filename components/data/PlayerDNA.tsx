"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  type PlayerDNA as PlayerDNAData,
  type PlayerDNACategory,
  type ConfidenceTier,
} from "@/lib/football/player-dna";

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

const INSIGHT_DOT_COLOR: Record<string, string> = {
  strength: "#22c55e",
  weakness: "#e66767",
  unique: "#3987e5",
  aha: "#d9a526",
};

/**
 * En kategoris "visa min beräkning" — <details> istället för en modal/JS-
 * dialog: noll extra klientlogik, tangentbordsåtkomligt gratis. Varje rad i
 * det utfällda innehållet är exakt de tal percentilen räknades från
 * (spelarens värde, peer-snittet, percentilen) — signaturfunktionen från
 * produktplanen (2026-08-20): allt går att spåra, inget är en svart låda.
 */
function CategoryDetail({ label, category }: { label: string; category: PlayerDNACategory }) {
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
              category.tier === "primary" ? "bg-[#3987e5]/15 text-[#3987e5]" : "bg-white/5 text-[#7d7c76]"
            }`}
          >
            {category.tier === "primary" ? "Primär" : "Sekundär"}
          </span>
        </span>
        <span className="font-medium text-white">{category.score}</span>
      </summary>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#3987e5]/15">
        <div className="h-1.5 rounded-full bg-[#3987e5]" style={{ width: `${category.score}%` }} />
      </div>
      <div className="mt-2 space-y-1 rounded-lg bg-black/20 p-2 text-[11px] text-[#898781]">
        {category.metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-2">
            <span>{m.label}</span>
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

/**
 * Player DNA — inte fem generiska staplar, utan en analys: spelartyp
 * (regelbaserad, se lib/football/player-dna.ts), ett "fingeravtryck"
 * (percentil-radar), rule-baserade insikter (styrka/svaghet/mest unikt/
 * "aha"), och en confidence-badge som ärligt visar hur säkert allt ovan är
 * — istället för att låtsas att en 180-minutersspelare är lika säker som en
 * med 2500. Varje kategori går att fälla ut för att se exakt vilka tal den
 * bygger på.
 */
export function PlayerDNA({ dna, compact = false }: { dna: PlayerDNAData; compact?: boolean }) {
  if (!dna.available) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Player DNA</h2>
        <p className="mt-2 text-sm text-[#898781]">{dna.unavailableReason}</p>
      </div>
    );
  }

  const { categories, confidence, playerType, summary, insights } = dna;
  if (!confidence) return null; // typvakt — available:true garanterar confidence, men TS vet inte det

  const orderedKeys = [
    ...CATEGORY_KEYS.filter((k) => categories[k].tier === "primary"),
    ...CATEGORY_KEYS.filter((k) => categories[k].tier === "secondary"),
  ];
  const radarData = CATEGORY_KEYS.filter((k) => categories[k].score !== null).map((k) => ({
    axis: CATEGORY_LABELS[k],
    Percentil: categories[k].score as number,
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Player DNA</h2>
          {playerType.label ? (
            <p className="mt-1 text-lg font-semibold text-white" title={playerType.reason ?? undefined}>
              {playerType.label}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#898781]">
              {confidence.tier === "låg"
                ? "Otillräckligt underlag för en spelartyp den här säsongen."
                : "Jämn profil — ingen tydlig spelartyp sticker ut."}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${CONFIDENCE_COLOR[confidence.tier]}22`, color: CONFIDENCE_COLOR[confidence.tier] }}
          title={`${confidence.ownMinutes} egna minuter · jämfört med ${confidence.peerCount} andra ${confidence.peerLabel} (säsongerna ${confidence.pooledSeasons.join(", ")})`}
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
              <Radar dataKey="Percentil" stroke="#3987e5" fill="#3987e5" fillOpacity={0.4} />
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
                <span
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: INSIGHT_DOT_COLOR[insight.type] }}
                  aria-hidden
                />
                {insight.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <div className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
          {orderedKeys.map((key) => (
            <CategoryDetail key={key} label={CATEGORY_LABELS[key]} category={categories[key]} />
          ))}
        </div>
      )}
    </div>
  );
}
