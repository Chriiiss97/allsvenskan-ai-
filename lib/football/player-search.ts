/**
 * EN delad namnmatchning för spelarsökning (2026-08-23) — används av både
 * lib/football/player-catalog.ts (serversidan) och
 * components/data/PlayerExplorer.tsx (den direktsökande listan), så samma
 * sökord alltid ger samma träffar oavsett var filtreringen råkar köras.
 *
 * Två saker den tidigare `full_name.toLowerCase().includes(q)` inte klarade:
 *
 *  1) Efternamn först, eller delar av båda. "Tolf Noah", "noah tolf" och
 *     "no tol" hittar alla Noah Tolf — varje ORD i sökningen matchas
 *     separat (AND mellan orden, ordningen spelar ingen roll), istället
 *     för att hela söksträngen måste förekomma ordagrant i namnet.
 *
 *  2) Diakriter. "zugelj" hittar Žugelj, "sjoberg" hittar Sjöberg,
 *     "boudri" hittar Boudri. Avsiktligt även för svenska å/ä/ö: man ska
 *     kunna skriva snabbt utan att träffa rätt tangent. Det här gäller
 *     BARA sökning — sorteringen använder fortfarande
 *     localeCompare("sv"), så bokstavsordningen förblir svensk.
 *
 * Fälten som matchas mot bestäms av anroparen (namn, och i listvyerna även
 * klubbnamn — så "aik" filtrerar fram AIK:s spelare utan att man behöver
 * leta upp klubbväljaren).
 */

/** Gemener + avskalade diakriter, så "Žugelj" och "zugelj" är samma sak. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Punkt/bindestreck/apostrof räknas som ordgränser ("E. Berisha", "de Brienne", "O'Neill"). */
const TOKEN_SEPARATORS = /[\s.\-'’]+/;

/** Söktermens ord, normaliserade. Tom array = ingen aktiv sökning (matchar allt). */
export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(TOKEN_SEPARATORS).filter(Boolean);
}

/**
 * Matchar redan tokeniserade söktermer mot ett antal fält. Separat från
 * {@link matchesSearchQuery} eftersom listvyerna kör den här per spelare i
 * en loop — söktermen ska tokeniseras EN gång, inte 400.
 */
export function matchesSearchTokens(tokens: string[], fields: (string | null | undefined)[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = fields.filter((f): f is string => Boolean(f)).map(normalizeSearchText);
  if (haystack.length === 0) return false;
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}

/** Bekvämlighetsformen för enstaka matchningar. */
export function matchesSearchQuery(query: string, fields: (string | null | undefined)[]): boolean {
  return matchesSearchTokens(tokenizeSearchQuery(query), fields);
}
