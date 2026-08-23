/**
 * OVR v2 — utvecklingssammanfattning för EN spelare.
 * =============================================================================
 * Ersätter lib/football/scout/rating-trend.ts. Samma regelbaserade filosofi
 * som förut: inga prognoser, bara jämförelser mellan riktiga, redan beräknade
 * betyg. Ingen ML, ingen extrapolering.
 */

import type { OvrHistoryPoint } from "./store";

export type TrendDirection = "uppåtgående" | "nedåtgående" | "stabil";

export interface OvrTrendSummary {
  peakSeasonYear: number | null;
  peakOvr: number | null;
  /** null = färre än två säsonger med betyg. */
  trend: TrendDirection | null;
  trendDescription: string | null;
  /** Senaste säsongen mot karriärsnittet. */
  formDescription: string | null;
}

/** Under den här förändringen är det brus, inte en trend. */
const TREND_THRESHOLD = 3;

export function buildOvrTrendSummary(history: readonly OvrHistoryPoint[]): OvrTrendSummary {
  const withOvr = history
    .filter((h): h is OvrHistoryPoint & { ovr: number } => h.ovr !== null)
    .sort((a, b) => a.seasonYear - b.seasonYear);

  if (withOvr.length === 0) {
    return { peakSeasonYear: null, peakOvr: null, trend: null, trendDescription: null, formDescription: null };
  }

  // Toppnoteringen får bara komma från en säsong med minst medelkonfidens. En
  // säsong där betyget nästan helt är historik skulle annars kunna krönas till
  // "karriärens bästa" — och då mäter vi vår egen prior, inte spelaren.
  const peakCandidates = withOvr.filter((h) => h.confidenceTier !== "låg");
  const peak = peakCandidates.length > 0 ? peakCandidates.reduce((best, h) => (h.ovr > best.ovr ? h : best)) : null;

  let trend: TrendDirection | null = null;
  let trendDescription: string | null = null;
  if (withOvr.length >= 2) {
    const latest = withOvr[withOvr.length - 1];
    const previous = withOvr[withOvr.length - 2];
    const delta = latest.ovr - previous.ovr;
    trend = delta >= TREND_THRESHOLD ? "uppåtgående" : delta <= -TREND_THRESHOLD ? "nedåtgående" : "stabil";

    const caveat =
      latest.confidenceTier === "låg"
        ? ` (begränsat underlag ${latest.seasonYear} — ${latest.minutesPlayed + latest.externalMinutes} minuter, tolka försiktigt)`
        : "";
    const verb = trend === "uppåtgående" ? "har stigit" : trend === "nedåtgående" ? "har fallit" : "är stabilt";
    trendDescription =
      trend === "stabil"
        ? `OVR ${verb} mellan ${previous.seasonYear} (${previous.ovr}) och ${latest.seasonYear} (${latest.ovr})${caveat}.`
        : `OVR ${verb} från ${previous.ovr} (${previous.seasonYear}) till ${latest.ovr} (${latest.seasonYear})${caveat}.`;
  }

  let formDescription: string | null = null;
  if (withOvr.length >= 2) {
    const latest = withOvr[withOvr.length - 1];
    const careerAvg = Math.round((withOvr.reduce((a, h) => a + h.ovr, 0) / withOvr.length) * 10) / 10;
    const diff = latest.ovr - careerAvg;
    const where = Math.abs(diff) < TREND_THRESHOLD ? "nära" : diff > 0 ? "över" : "under";
    formDescription = `Säsongen ${latest.seasonYear} (${latest.ovr}) ligger ${where} karriärsnittet (${careerAvg}).`;
  }

  return {
    peakSeasonYear: peak?.seasonYear ?? null,
    peakOvr: peak?.ovr ?? null,
    trend,
    trendDescription,
    formDescription,
  };
}

/**
 * Beskriver skillnaden mellan säsongsbetyg och historikbetyg i klartext.
 *
 * Det är den mest användbara signalen i hela modellen för en scout: när
 * current_season_rating ligger klart över historical_rating har spelaren tagit
 * ett steg som prior ännu inte hunnit ikapp. Ligger den under är det antingen
 * en svacka eller en spelare på väg ned.
 */
export function describeSeasonVsHistory(params: {
  ovr: number | null;
  currentSeasonRating: number | null;
  historicalRating: number | null;
  priorWeight: number;
}): string | null {
  const { currentSeasonRating, historicalRating, priorWeight } = params;
  if (currentSeasonRating === null || historicalRating === null) return null;

  const diff = Math.round((currentSeasonRating - historicalRating) * 10) / 10;
  if (priorWeight >= 0.7) {
    return `Betyget är till ${Math.round(priorWeight * 100)} % byggt på tidigare säsonger — årets speltid räcker inte för ett självständigt omdöme.`;
  }
  if (Math.abs(diff) < TREND_THRESHOLD) {
    return `Årets prestation (${currentSeasonRating}) ligger i linje med vad historiken förutsade (${historicalRating}).`;
  }
  if (diff > 0) {
    return `Årets prestation (${currentSeasonRating}) ligger ${diff} över vad historiken förutsade (${historicalRating}) — ett steg uppåt.`;
  }
  return `Årets prestation (${currentSeasonRating}) ligger ${Math.abs(diff)} under vad historiken förutsade (${historicalRating}).`;
}
