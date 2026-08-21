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
