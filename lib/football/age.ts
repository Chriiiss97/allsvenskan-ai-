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
