import type { SeasonRatingPoint } from "./rating-store";

/**
 * Player Rating — utvecklingssammanfattning för EN spelare, byggd på hela
 * `player_season_rating`-historiken. Samma regelbaserade filosofi som
 * player-dna.ts:s insiktsmotor (aldrig ML/prognos) — bara jämförelser av
 * riktiga, redan beräknade OVR-tal mellan säsonger.
 *
 * "Peak" kräver INTE lägst konfidens "låg" — en toppnotering byggd på 200
 * minuter och 6 peers vore en gissning kronad till "karriärens bästa
 * säsong", inte ett verkligt uttalande. Trend/form kräver bara att OVR
 * finns (även "låg"-konfidens-säsonger räknas med i själva jämförelsen,
 * men flaggas i texten) — annars skulle en spelare med mest lågminuters-
 * säsonger aldrig kunna få en trendbedömning alls.
 */

export type TrendDirection = "uppåtgående" | "nedåtgående" | "stabil";

export interface RatingTrendSummary {
  peakSeasonYear: number | null;
  peakOvr: number | null;
  trend: TrendDirection | null; // null = otillräckligt underlag (färre än två säsonger med OVR)
  trendDescription: string | null;
  formDescription: string | null; // senaste säsongen mot karriärsnittet
}

/** Tröskeln för att kalla en förändring "uppåtgående"/"nedåtgående" istället för "stabil" — undviker att brus på ±1-2 poäng läses som en trend. */
const TREND_THRESHOLD = 3;

export function buildRatingTrendSummary(history: SeasonRatingPoint[]): RatingTrendSummary {
  const withOvr = history.filter((h): h is SeasonRatingPoint & { ovr: number } => h.ovr !== null).sort((a, b) => a.seasonYear - b.seasonYear);

  if (withOvr.length === 0) {
    return { peakSeasonYear: null, peakOvr: null, trend: null, trendDescription: null, formDescription: null };
  }

  // Peak — bara bland säsonger med minst "medel"-konfidens, aldrig en
  // låg-underlags-säsong krönt till karriärens bästa.
  const peakCandidates = withOvr.filter((h) => h.confidenceTier !== "låg");
  const peak = peakCandidates.length > 0 ? peakCandidates.reduce((best, h) => (h.ovr > best.ovr ? h : best)) : null;

  let trend: TrendDirection | null = null;
  let trendDescription: string | null = null;
  if (withOvr.length >= 2) {
    const latest = withOvr[withOvr.length - 1];
    const previous = withOvr[withOvr.length - 2];
    const delta = latest.ovr - previous.ovr;
    trend = delta >= TREND_THRESHOLD ? "uppåtgående" : delta <= -TREND_THRESHOLD ? "nedåtgående" : "stabil";
    const caveat = latest.confidenceTier === "låg" ? " (begränsat underlag den senaste säsongen — tolka försiktigt)" : "";
    if (trend === "uppåtgående") {
      trendDescription = `OVR har stigit från ${previous.ovr} (${previous.seasonYear}) till ${latest.ovr} (${latest.seasonYear})${caveat}.`;
    } else if (trend === "nedåtgående") {
      trendDescription = `OVR har fallit från ${previous.ovr} (${previous.seasonYear}) till ${latest.ovr} (${latest.seasonYear})${caveat}.`;
    } else {
      trendDescription = `OVR är stabilt mellan ${previous.seasonYear} (${previous.ovr}) och ${latest.seasonYear} (${latest.ovr})${caveat}.`;
    }
  }

  let formDescription: string | null = null;
  if (withOvr.length >= 2) {
    const latest = withOvr[withOvr.length - 1];
    const careerAvg = Math.round((withOvr.reduce((a, h) => a + h.ovr, 0) / withOvr.length) * 10) / 10;
    const diff = latest.ovr - careerAvg;
    if (Math.abs(diff) < TREND_THRESHOLD) {
      formDescription = `Säsongen ${latest.seasonYear} (${latest.ovr}) ligger nära karriärsnittet (${careerAvg}).`;
    } else if (diff > 0) {
      formDescription = `Säsongen ${latest.seasonYear} (${latest.ovr}) ligger över karriärsnittet (${careerAvg}).`;
    } else {
      formDescription = `Säsongen ${latest.seasonYear} (${latest.ovr}) ligger under karriärsnittet (${careerAvg}).`;
    }
  }

  return {
    peakSeasonYear: peak?.seasonYear ?? null,
    peakOvr: peak?.ovr ?? null,
    trend,
    trendDescription,
    formDescription,
  };
}
