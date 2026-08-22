/**
 * Fas 18 (2026-08-22) — DELAD hjälpfunktion, tidigare duplicerad i tre
 * filer (career-journey.ts, post-allsvenskan.ts, career-timeline.ts).
 * Normaliserar ett klubbnamn för GRUPPERING/IDENTITETSJÄMFÖRELSE — ALDRIG
 * för visning. api-football stavar samma klubb olika beroende på
 * källtabell ("IFK Göteborg" i vår egen statistics-tabell, "IFK Goteborg"
 * utan diakritiska tecken i /transfers-svar för t.ex. Svenska Cupen) —
 * utan normalisering grupperas dessa som TVÅ olika klubbar, vilket
 * felaktigt fick en spelare som bara bytte TÄVLING (liga → cup, samma
 * klubb) att se ut som att hen "lämnat Allsvenskan" eller spelat "utomlands"
 * för sin egen Allsvenska klubb (verkligt fall hittat i verifieringen:
 * J. Bager).
 */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
