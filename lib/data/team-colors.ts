/**
 * Subtila klubbfärgsaccenter — bara för IFK Göteborg och AIK, de enda lag
 * vi har fullständig data för (se lib/football/tools.ts COMPARABLE_TEAM_
 * EXTERNAL_IDS). Används som kant-/textaccenter, aldrig som stora ytor
 * (se designfeedback: "inte så att hela sidan blir färgglad").
 */
const TEAM_ACCENTS: Record<number, string> = {
  366: "#3987e5", // IFK Göteborg — blå
  377: "#eab308", // AIK — guld
};

const FALLBACK_ACCENT = "#3987e5";

export function getTeamAccent(externalId: number | null | undefined): string {
  if (!externalId) return FALLBACK_ACCENT;
  return TEAM_ACCENTS[externalId] ?? FALLBACK_ACCENT;
}
