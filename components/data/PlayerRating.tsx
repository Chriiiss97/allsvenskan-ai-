"use client";

import type { AnyPlayerRating } from "@/lib/football/rating/compute-rating";
import { RATING_CATEGORY_LABELS, type RatingCategoryKey } from "@/lib/football/rating/metric-registry";
import type { RatingCategory } from "@/lib/football/rating/categories";
import type { GoalkeeperMetricDetail } from "@/lib/football/rating/goalkeeper-rating";
import type { OvrContribution } from "@/lib/football/rating/position-rating-config";
import type { ConfidenceTier } from "@/lib/football/confidence";

const CONFIDENCE_COLOR: Record<ConfidenceTier, string> = {
  hög: "#22c55e",
  medel: "#d9a526",
  låg: "#e66767",
};

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  hög: "Säkert underlag",
  medel: "Medelsäkert underlag",
  låg: "Begränsat underlag",
};

/** Fyra breda band, samma andor som EA:s egna kort — men aldrig 100, aldrig FIFA-brandat. */
function ovrColor(ovr: number): string {
  if (ovr >= 80) return "#22c55e";
  if (ovr >= 65) return "#3987e5";
  if (ovr >= 50) return "#d9a526";
  return "#e66767";
}

function OvrBadge({ ovr, label }: { ovr: number | null; label: string }) {
  const color = ovr !== null ? ovrColor(ovr) : "#5f5e59";
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-2"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14` }}
      title="0–99, byggd på riktig säsongsstatistik — aldrig ett gissat tal"
    >
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {ovr ?? "—"}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-[#898781]">{label}</span>
    </div>
  );
}

/**
 * "Varför X?"-nedbrytningen för EN kategori: percentil-score → vikt →
 * bidrag, plus varje enskilt mått som gick in i percentilen. Samma
 * <details>-mönster som components/data/PlayerDNA.tsx (noll extra
 * klient-JS, gratis tangentbordsåtkomst).
 */
function OutfieldCategoryDetail({
  categoryKey,
  category,
  contribution,
}: {
  categoryKey: RatingCategoryKey;
  category: RatingCategory;
  contribution: OvrContribution | undefined;
}) {
  const label = RATING_CATEGORY_LABELS[categoryKey];
  if (category.score === null || !contribution) {
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
        <span className="text-[#c3c2b7]">{label}</span>
        <span className="flex items-center gap-2 tabular-nums">
          <span className="text-[#7d7c76]">vikt {contribution.weight}%</span>
          <span className="font-medium text-white">{category.score}</span>
        </span>
      </summary>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#3987e5]/15">
        <div className="h-1.5 rounded-full bg-[#3987e5]" style={{ width: `${category.score}%` }} />
      </div>
      <div className="mt-2 space-y-1 rounded-lg bg-black/20 p-2 text-[11px] text-[#898781]">
        {category.metrics.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-2">
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
        <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5 text-[#c3c2b7]">
          <span>Bidrag till OVR</span>
          <span className="tabular-nums">
            {category.score} × {contribution.weight}% = <span className="font-medium text-white">{contribution.contribution}</span>
          </span>
        </div>
      </div>
    </details>
  );
}

function GoalkeeperMetricRow({ metric }: { metric: GoalkeeperMetricDetail }) {
  return (
    <details className="py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-xs marker:content-none">
        <span className="text-[#c3c2b7]">{metric.label}</span>
        <span className="flex items-center gap-2 tabular-nums">
          <span className="text-[#7d7c76]">vikt {metric.weight}%</span>
          <span className="font-medium text-white">
            {metric.playerValue}
            {metric.unit}
          </span>
        </span>
      </summary>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#3987e5]/15">
        <div className="h-1.5 rounded-full bg-[#3987e5]" style={{ width: `${metric.percentile}%` }} />
      </div>
      <div className="mt-2 space-y-1 rounded-lg bg-black/20 p-2 text-[11px] text-[#898781]">
        <div className="flex items-center justify-between gap-2">
          <span>Snitt målvakter</span>
          <span className="tabular-nums">
            {metric.peerAverage}
            {metric.unit} · percentil {metric.percentile}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5 text-[#c3c2b7]">
          <span>Bidrag till OVR</span>
          <span className="tabular-nums">
            {metric.percentile} × {metric.weight}% = <span className="font-medium text-white">{metric.contribution}</span>
          </span>
        </div>
      </div>
    </details>
  );
}

const OUTFIELD_CATEGORY_ORDER: RatingCategoryKey[] = ["shooting", "passing", "dribbling", "defending"];

/**
 * Player Rating — statistisk 0–99-OVR, helt separat från Player DNA (DNA
 * svarar "vilken typ av spelare", Rating svarar "hur bra presterade den
 * här säsongen"). Kortet visar ALLTID population + säsong ("bland
 * Allsvenskans anfallare, 2024") och en confidence-badge — aldrig en
 * siffra utan sitt underlag synligt. Varje kategori/mått går att fälla ut
 * till råvärde → percentil → vikt → bidrag, spårbart hela vägen.
 */
export function PlayerRating({ data, season }: { data: AnyPlayerRating; season: number }) {
  const { rating } = data;

  if (!rating.available) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Player Rating</h2>
        <p className="mt-2 text-sm text-[#898781]">{rating.unavailableReason}</p>
      </div>
    );
  }

  const confidence = rating.confidence;
  if (!confidence) return null; // typvakt — available:true garanterar confidence

  // Explicit populationsdisklosyr — aldrig en siffra utan att visa VAD den
  // jämförs mot (kravet från produktplanen: "OVR 84, bland Allsvenskans
  // anfallare, 2024").
  const populationLabel = `bland Allsvenskans ${confidence.peerLabel}, ${season}`;

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Player Rating</h2>
          <p className="mt-1 text-xs text-[#898781]">
            Statistisk helhetssiffra, {populationLabel} · jämfört med {confidence.peerCount} andra {confidence.peerLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OvrBadge ovr={rating.ovr} label="OVR" />
        </div>
      </div>

      <div className="mt-2">
        <span
          className="inline-block rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${CONFIDENCE_COLOR[confidence.tier]}22`, color: CONFIDENCE_COLOR[confidence.tier] }}
          title={`${confidence.ownMinutes} egna minuter · jämfört med ${confidence.peerCount} andra ${confidence.peerLabel}`}
        >
          {CONFIDENCE_LABEL[confidence.tier]}
        </span>
      </div>

      <div className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
        {data.kind === "outfield"
          ? OUTFIELD_CATEGORY_ORDER.map((key) => (
              <OutfieldCategoryDetail
                key={key}
                categoryKey={key}
                category={data.rating.categories![key]}
                contribution={data.rating.contributions.find((c) => c.category === key)}
              />
            ))
          : data.rating.metrics.map((m) => <GoalkeeperMetricRow key={m.key} metric={m} />)}
      </div>
    </div>
  );
}
