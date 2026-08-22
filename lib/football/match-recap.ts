import type { MatchInsight } from "./match-insight";
import type { MatchTeamStatsComparison, TeamMatchStats } from "./team-rollup";

/**
 * Fas 16f (2026-08-22) — "Matchrapport": jämför vår FÖRHANDSANALYS
 * (Match Intelligence, buildMatchInsight — bara `favoredTeam`/`teamReasons`,
 * ALDRIG spelarklausulen, som svarar på en annan fråga) mot det FAKTISKA
 * utfallet (resultat + fixture_team_stats, samma tal Lagstatistik-sektionen
 * redan visar). Rent deterministiskt — inga LLM-anrop, ingen fritext utöver
 * fasta mallmeningar med redan verifierade tal isatta.
 *
 * "Rätt/blandat/fel" avgörs INTE bara av vem som vann — se domstabellen i
 * buildMatchRecap: en favorit som vann men förlorade de flesta av de
 * jämförbara matchmåtten (skott/bollinnehav/xG osv.) räknas som en
 * BLANDAD träff, inte en ren. Tröskeln är "minst 2 av de jämförbara måtten
 * gick åt andra hållet" — dokumenterad här, inte gömd i kod.
 *
 * Om matchen saknar en tydlig förhandsfavorit (`insight.favoredTeam ===
 * null`) eller saknar lagstatistik att stämma av mot skrivs det ärligt ut —
 * ALDRIG en påhittad slutsats om det underlaget inte finns.
 */

export type RecapVerdict = "confirmed" | "mixed" | "missed" | "no-favorite";

export interface MatchRecap {
  verdict: RecapVerdict;
  favoredTeamName: string | null;
  /** true = favoriten vann, false = favoriten vann inte (förlust/oavgjort),
   * null = ingen favorit fanns. Explicit fält (inte härlett från `verdict`,
   * som kan betyda "mixed" av tre olika skäl) — match-narrative.ts använder
   * det för att veta om resultatet redan nämnts i confirmingPoints[0]
   * respektive surprisingPoints[0], så det inte upprepas. */
  favoredTeamWon: boolean | null;
  scoreLine: string;
  summary: string;
  preMatchReasons: string[];
  confirmingPoints: string[];
  surprisingPoints: string[];
  hasStatsData: boolean;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

const OFFENSIVE_STATS: { key: keyof TeamMatchStats; label: string; suffix: string }[] = [
  { key: "possessionPct", label: "bollinnehav", suffix: "%" },
  { key: "shotsTotal", label: "skott", suffix: "" },
  { key: "shotsOnTarget", label: "skott på mål", suffix: "" },
  { key: "corners", label: "hörnor", suffix: "" },
  { key: "expectedGoals", label: "xG", suffix: "" },
];

export function buildMatchRecap(
  insight: MatchInsight | null,
  homeName: string,
  awayName: string,
  homeScore: number | null,
  awayScore: number | null,
  matchStats: MatchTeamStatsComparison
): MatchRecap | null {
  if (!insight || homeScore === null || awayScore === null) return null;

  const actualWinner: "home" | "away" | "draw" = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  const scoreLine = `${homeScore}–${awayScore}`;
  const hasStatsData = !!(matchStats.home && matchStats.away);

  if (!insight.favoredTeam) {
    return {
      verdict: "no-favorite",
      favoredTeamName: null,
      favoredTeamWon: null,
      scoreLine,
      summary: "Inför matchen pekade vår analys inte ut någon tydlig favorit — formen och hemmaövertaget var för jämna för att dra en slutsats.",
      preMatchReasons: insight.teamReasons,
      confirmingPoints: [],
      surprisingPoints: [],
      hasStatsData,
    };
  }

  const favoredTeamName = insight.favoredTeam === "home" ? homeName : awayName;
  const otherTeamName = insight.favoredTeam === "home" ? awayName : homeName;

  let favoredLeads = 0;
  let favoredTrails = 0;
  const confirmingPoints: string[] = [];
  const surprisingPoints: string[] = [];

  // Själva resultatet är alltid den första, tydligaste bekräftelsen/
  // överraskningen — oavsett om vi har lagstatistik att bryta ner det
  // vidare med eller ej.
  if (actualWinner === insight.favoredTeam) {
    confirmingPoints.push(`${favoredTeamName} vann matchen`);
  } else if (actualWinner === "draw") {
    surprisingPoints.push(`${favoredTeamName} vann inte trots att laget var favorittippat — matchen slutade oavgjort`);
  } else {
    surprisingPoints.push(`${otherTeamName} vann matchen trots att ${favoredTeamName} var favorittippat`);
  }

  if (hasStatsData) {
    for (const stat of OFFENSIVE_STATS) {
      const homeVal = matchStats.home![stat.key];
      const awayVal = matchStats.away![stat.key];
      if (homeVal == null || awayVal == null) continue;
      const favoredVal = insight.favoredTeam === "home" ? homeVal : awayVal;
      const otherVal = insight.favoredTeam === "home" ? awayVal : homeVal;
      if (favoredVal > otherVal) {
        favoredLeads++;
        confirmingPoints.push(`${fmt(favoredVal)}${stat.suffix} ${stat.label} (mot ${fmt(otherVal)}${stat.suffix})`);
      } else if (otherVal > favoredVal) {
        favoredTrails++;
        surprisingPoints.push(`${otherTeamName} hade fler ${stat.label} — ${fmt(otherVal)}${stat.suffix} mot ${favoredTeamName}s ${fmt(favoredVal)}${stat.suffix}`);
      }
    }
  }

  let verdict: RecapVerdict;
  let summary: string;
  if (actualWinner === insight.favoredTeam) {
    if (favoredTrails >= 2) {
      verdict = "mixed";
      summary = `${favoredTeamName} var favorittippat inför matchen och vann till slut ${scoreLine}, men matchbilden var jämnare än väntat.`;
    } else {
      verdict = "confirmed";
      summary = `${favoredTeamName} var favorittippat inför matchen och vann till slut ${scoreLine}.`;
    }
  } else if (actualWinner === "draw") {
    verdict = "mixed";
    summary = `${favoredTeamName} var favorittippat inför matchen, men det slutade oavgjort ${scoreLine}.`;
  } else if (favoredLeads >= 2) {
    verdict = "mixed";
    summary = `${favoredTeamName} var favorittippat och låg före i flera av matchmåtten, men ${otherTeamName} vann ändå ${scoreLine}.`;
  } else {
    verdict = "missed";
    summary = `${favoredTeamName} var favorittippat inför matchen, men ${otherTeamName} vann ${scoreLine}.`;
  }

  return {
    verdict,
    favoredTeamName,
    favoredTeamWon: actualWinner === insight.favoredTeam,
    scoreLine,
    summary,
    preMatchReasons: insight.teamReasons,
    confirmingPoints,
    surprisingPoints,
    hasStatsData,
  };
}
