/**
 * Extraherad ur app/(app)/data/players/[id]/page.tsx (fanns bara inline där
 * tidigare) — datasektions-breddningen (2026-08-20) behöver samma beräkning
 * i spelarlistan (lib/football/player-catalog.ts), en delad funktion
 * istället för att duplicera den.
 */
export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Fas 17 (2026-08-22) — flyttad hit från lib/football/rating/scout-
 * intelligence-zscore.ts (fanns bara lokalt där) efter användarfeedback:
 * en spelares ålder på en spelarprofil ska stämma med SÄSONGEN man tittar
 * på, inte dagens datum — annars visas t.ex. en spelares 2019-säsong med
 * hens ålder 2026. Referenspunkt: 1 juli det året (mitt i Allsvenskan-
 * säsongen, samma konvention Scout Intelligence redan använde för
 * åldersbrackets).
 */
export function ageAtSeason(birthDate: string | null, seasonYear: number): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = seasonYear - birth.getUTCFullYear();
  const hadBirthdayByJuly1 = birth.getUTCMonth() < 6 || (birth.getUTCMonth() === 6 && birth.getUTCDate() <= 1);
  if (!hadBirthdayByJuly1) age -= 1;
  return age;
}
