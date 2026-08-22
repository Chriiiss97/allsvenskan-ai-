import type { MatchFact } from "./match-preview";
import { asCountPct, asAvg } from "./match-preview-sv";

/**
 * Fas 16b (2026-08-22) — ett kompakt, visuellt H2H-sammandrag istället för
 * 6 separata punktrader (vinst/förlust/oavgjort × två lag). Bygger UTESLUTANDE
 * på tal som redan finns i preview.headToHead:s `data`-fält (samma källa som
 * match-preview-sv.ts:s meningar) — aldrig omräknat bortom enkel addition av
 * tre redan exakta heltal (homeWins+awayWins+draws), aldrig gissat.
 */

function findFact(facts: MatchFact[], typeIds: number[], participant: "home" | "away"): MatchFact | null {
  return facts.find((f) => typeIds.includes(f.sportmonksTypeId) && f.participant === participant) ?? null;
}

export interface H2HSummary {
  windowLabel: string;
  totalMatches: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  /** Hemmalagets vinster NÄR DE SPELAT HEMMA i den här inbördesserien — samma data.home-fält som redan fanns, aldrig uträknat. */
  homeWinsAtHome: number | null;
  homeGoalsPerMatch: number | null;
  awayGoalsPerMatch: number | null;
}

export function buildH2HSummary(facts: MatchFact[]): H2HSummary | null {
  let homeWinsFact = findFact(facts, [76088], "home");
  let awayWinsFact = findFact(facts, [76088], "away");
  let drawsFact = findFact(facts, [76105], "home") ?? findFact(facts, [76105], "away");
  let windowLabel = "Alla möten";

  if (!homeWinsFact || !awayWinsFact || !drawsFact) {
    homeWinsFact = findFact(facts, [87860], "home");
    awayWinsFact = findFact(facts, [87860], "away");
    drawsFact = findFact(facts, [87861], "home") ?? findFact(facts, [87861], "away");
    windowLabel = "Senaste 5 mötena";
  }

  const homeWins = homeWinsFact ? asCountPct(homeWinsFact.data) : null;
  const awayWins = awayWinsFact ? asCountPct(awayWinsFact.data) : null;
  const draws = drawsFact ? asCountPct(drawsFact.data) : null;
  if (!homeWins || !awayWins || !draws) return null;

  const homeGoalsFact = findFact(facts, [76106], "home") ?? findFact(facts, [87864], "home");
  const awayGoalsFact = findFact(facts, [76106], "away") ?? findFact(facts, [87864], "away");

  return {
    windowLabel,
    totalMatches: homeWins.count + awayWins.count + draws.count,
    homeWins: homeWins.count,
    awayWins: awayWins.count,
    draws: draws.count,
    homeWinsAtHome: homeWins.home,
    homeGoalsPerMatch: homeGoalsFact ? (asAvg(homeGoalsFact.data)?.average ?? null) : null,
    awayGoalsPerMatch: awayGoalsFact ? (asAvg(awayGoalsFact.data)?.average ?? null) : null,
  };
}
