/**
 * Player Rating-projektet (2026-08-21): extraherad ur lib/football/player-dna.ts,
 * som redan hade den här exakta tvåfaktors-konfidenslogiken (egna minuter +
 * peer-antal, sämsta av de två vinner). Delad nu mellan Player DNA och
 * Player Rating så båda alltid klassar "hur säkert är det här talet?" på
 * exakt samma sätt — samma trösklar, ingen ny logik uppfunnen.
 */

export type ConfidenceTier = "hög" | "medel" | "låg";

export function tierFromThresholds(value: number, high: number, medium: number): ConfidenceTier {
  if (value >= high) return "hög";
  if (value >= medium) return "medel";
  return "låg";
}

const TIER_ORDER: ConfidenceTier[] = ["låg", "medel", "hög"];

/** Sämsta av två tiers vinner — ett lågt underlag på EN faktor räcker för att sänka helheten. */
export function worseTier(a: ConfidenceTier, b: ConfidenceTier): ConfidenceTier {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(a), TIER_ORDER.indexOf(b))];
}
