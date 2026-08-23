/**
 * Player Rating-projektet (2026-08-21): extraherad ur lib/football/player-dna.ts,
 * som redan hade den här exakta formeln. Delad nu mellan Player DNA och
 * Player Rating så båda alltid räknar percentil på exakt samma sätt.
 *
 * Percentil = andel peers med värde ≤ spelarens — ett rent empiriskt
 * percentilrangordnande, medvetet INTE en z-score (inget antagande om
 * normalfördelning, robust mot skeva små samples).
 */
export function percentile(value: number, peerValues: number[]): number {
  const countLessOrEqual = peerValues.filter((v) => v <= value).length;
  return Math.round((countLessOrEqual / peerValues.length) * 100);
}

/**
 * Scout Engine (2026-08-21): flyttad hit från den numera raderade OVR v1-motorn,
 * som redan hade den här exakta formeln för "insläppta mål/90" (lägre är
 * bättre). Delad nu med lib/football/scout/scout-metrics.ts:s "dribblad
 * förbi/90" (samma sorts mått — lägre är bättre) så båda räknar likadant.
 *
 * Percentil för ett mått där LÄGRE värde är bättre — andelen peers med
 * LIKA HÖGT ELLER HÖGRE (alltså sämre eller lika) värde. Negerar båda
 * sidor och återanvänder percentile() ovan istället för att duplicera
 * logiken — "andel peers med -peerValue ≤ -spelarens" är matematiskt
 * identiskt med "andel peers med peerValue ≥ spelarens".
 */
export function invertedPercentile(value: number, peerValues: number[]): number {
  return percentile(-value, peerValues.map((v) => -v));
}
