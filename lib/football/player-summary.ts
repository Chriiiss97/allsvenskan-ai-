import type { CareerTimelineEntry, ForeignCareerStint } from "./career-timeline";
import type { PlayerTrophy } from "./player-trophies";
import { translatePosition, translateNationality } from "@/lib/i18n/sv";

/**
 * Fas 18c (2026-08-22) — "Om spelaren": en kort, deterministisk textsammanfattning
 * längst ner på spelarprofilen. INGET AI-anrop, INGEN fri text — precis
 * samma disciplin som lib/football/match-narrative.ts: varje mening byggs
 * av redan verifierade fält, en tom/saknad datapunkt ger bara en kortare
 * text, aldrig en gissning eller utfyllnad.
 */
export function buildPlayerSummary(input: {
  name: string;
  position: string | null;
  nationality: string | null;
  currentTeamName: string | null;
  domesticEntries: CareerTimelineEntry[];
  foreignStints: ForeignCareerStint[];
  trophies: PlayerTrophy[];
  hasLeftCurrentTeam: boolean | null;
  previousTeamName: string | null;
  latestTransferTeamName: string | null;
}): string[] {
  const sentences: string[] = [];
  const posLabel = translatePosition(input.position)?.toLowerCase() ?? null;
  const natLabel = translateNationality(input.nationality);

  // 1) Vem är spelaren. "från {land}" istället för en böjd adjektivform
  // ("skotsk") — undviker en egen, overifierad land→adjektiv-tabell helt.
  const teamClause = input.currentTeamName ? ` som representerar ${input.currentTeamName}` : "";
  if (posLabel && natLabel) {
    sentences.push(`${input.name} är en ${posLabel} från ${natLabel}${teamClause}.`);
  } else if (posLabel) {
    sentences.push(`${input.name} är en ${posLabel}${teamClause}.`);
  } else if (natLabel) {
    sentences.push(`${input.name} kommer från ${natLabel}${input.currentTeamName ? ` och representerar ${input.currentTeamName}` : ""}.`);
  } else if (input.currentTeamName) {
    sentences.push(`${input.name} representerar ${input.currentTeamName}.`);
  }

  // 2) Allsvensk klubbresa.
  const domesticClubsChrono = [...input.domesticEntries].sort((a, b) => a.seasonYear - b.seasonYear);
  const domesticClubNames = [...new Set(domesticClubsChrono.map((e) => e.teamName))];
  if (domesticClubNames.length === 1) {
    const first = domesticClubsChrono[0];
    const last = domesticClubsChrono[domesticClubsChrono.length - 1];
    const span = first.seasonYear === last.seasonYear ? `${first.seasonYear}` : `${first.seasonYear}–${last.seasonYear}`;
    sentences.push(`I Allsvenskan har ${input.name} representerat ${domesticClubNames[0]} (${span}).`);
  } else if (domesticClubNames.length > 1) {
    sentences.push(`I Allsvenskan har ${input.name} spelat för ${domesticClubNames.slice(0, -1).join(", ")} och ${domesticClubNames[domesticClubNames.length - 1]}.`);
  }

  // 3) Har lämnat Allsvenskan.
  if (input.hasLeftCurrentTeam && input.latestTransferTeamName) {
    sentences.push(
      `${input.previousTeamName ? `Efter ${input.previousTeamName} ` : ""}spelar ${input.name} numera för ${input.latestTransferTeamName}.`
    );
  }

  // 4) Utländska klubbar (utöver senaste, om fler dokumenterade).
  const foreignClubNames = [...new Set(input.foreignStints.map((s) => s.teamName))];
  if (foreignClubNames.length > 1) {
    sentences.push(`Utomlands har ${input.name} representerat ${foreignClubNames.join(", ")}.`);
  }

  // 5) Meriter.
  const wins = input.trophies.filter((t) => t.place === "Winner");
  if (wins.length > 0) {
    const list = wins.map((t) => `${t.leagueName} (${t.season})`);
    sentences.push(`Genom karriären har ${input.name} vunnit ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} och ${list[list.length - 1]}`}.`);
  }

  return sentences;
}
