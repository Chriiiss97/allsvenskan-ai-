"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Dot } from "recharts";
import type { SeasonRatingPoint } from "@/lib/football/rating/rating-store";
import type { RatingTrendSummary } from "@/lib/football/rating/rating-trend";
import { ovrColor } from "@/lib/football/rating/ovr-color";
import type { ConfidenceTier } from "@/lib/football/confidence";

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  hög: "Säkert",
  medel: "Medelsäkert",
  låg: "Begränsat",
};
const CONFIDENCE_COLOR: Record<ConfidenceTier, string> = {
  hög: "#22c55e",
  medel: "#d9a526",
  låg: "#e66767",
};

/** Punkter med "låg" konfidens ritas ihåliga (bara kant, ingen fyllning) — samma "visa alltid, flagga aldrig dölj"-princip som resten av Player Rating. */
function TrendDot(props: { cx?: number; cy?: number; payload?: { confidenceTier: ConfidenceTier | null } }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const tier = payload.confidenceTier;
  const isLow = tier === "låg";
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={isLow ? 4 : 5}
      fill={isLow ? "transparent" : "#3987e5"}
      stroke="#3987e5"
      strokeWidth={isLow ? 1.5 : 0}
    />
  );
}

/**
 * Player Rating — utvecklingssektion på spelarprofilen. Läser
 * player_season_rating-facit direkt (inget live-beräknat här, se
 * rating-store.ts) — bara OVR + konfidens per säsong, ingen kategori/
 * mått-nedbrytning (den finns bara för DEN VALDA säsongen i PlayerRating-
 * kortet ovanför). Komplement till, aldrig ersättning för, nuvarande status.
 */
export function PlayerRatingHistory({ history, trend }: { history: SeasonRatingPoint[]; trend: RatingTrendSummary }) {
  const chartData = history
    .filter((h) => h.ovr !== null)
    .map((h) => ({ year: String(h.seasonYear), ovr: h.ovr as number, confidenceTier: h.confidenceTier }));

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Utveckling</h2>
        <p className="mt-2 text-sm text-[#898781]">Ingen sparad ratinghistorik ännu för den här spelaren.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">Utveckling</h2>
        {trend.peakSeasonYear !== null && (
          <span
            className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${ovrColor(trend.peakOvr!)}22`, color: ovrColor(trend.peakOvr!) }}
            title="Högsta OVR bland säsonger med minst medelsäkert underlag"
          >
            Toppsäsong {trend.peakSeasonYear} ({trend.peakOvr})
          </span>
        )}
      </div>

      {(trend.trendDescription || trend.formDescription) && (
        <div className="mt-2 space-y-1">
          {trend.trendDescription && <p className="text-sm text-[#c3c2b7]">{trend.trendDescription}</p>}
          {trend.formDescription && <p className="text-sm text-[#c3c2b7]">{trend.formDescription}</p>}
        </div>
      )}

      {chartData.length >= 2 && (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#2c2c2a" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#898781", fontSize: 11 }} axisLine={{ stroke: "#2c2c2a" }} tickLine={false} />
              <YAxis domain={[0, 99]} tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Line
                type="monotone"
                dataKey="ovr"
                stroke="#3987e5"
                strokeWidth={2}
                dot={<TrendDot />}
                activeDot={{ r: 6, fill: "#3987e5" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
        {[...history].reverse().map((h) => (
          <div key={h.seasonId} className="flex items-center justify-between gap-2 py-0.5 text-xs">
            <span className="text-[#c3c2b7]">{h.seasonYear}</span>
            <span className="flex items-center gap-2 tabular-nums">
              {h.confidenceTier && (
                <span
                  className="rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                  style={{ backgroundColor: `${CONFIDENCE_COLOR[h.confidenceTier]}1a`, color: CONFIDENCE_COLOR[h.confidenceTier] }}
                >
                  {CONFIDENCE_LABEL[h.confidenceTier]}
                </span>
              )}
              <span className="text-[#5f5e59]">{h.ownMinutes} min</span>
              <span className="w-8 text-right font-semibold" style={{ color: h.ovr !== null ? ovrColor(h.ovr) : "#5f5e59" }}>
                {h.ovr ?? "—"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
