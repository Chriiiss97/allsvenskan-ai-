import { normalize } from "./resolve-team";

/**
 * Levenshtein-baserad namnlikhet (0–1), återanvänder samma normalize()
 * (diakritik-strippning) som resolveTeam(). Används BARA av Sportmonks-
 * spelarmappningen (Fas 3) för att klassificera "fuzzy_name"-kandidater —
 * en riktig identitetsmatchning kräver alltid ytterligare bekräftelse
 * (födelsedatum) innan den kan auto-godkännas, se
 * scripts/import/sportmonks-map-players.ts.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * BUG UPPTÄCKT under Fas 5-verifiering (skarp körning): API-Football lagrar
 * ofta bara ett förnamnsINITIAL ("A. Erlingmark"), Sportmonks ger fullt
 * förnamn ("August Erlingmark"). Rå Levenshtein över HELA strängen straffar
 * det oproportionerligt hårt när namnet är kort — "a. erlingmark" (13 tkn)
 * mot "august erlingmark" (18 tkn) hamnade UNDER 0.8-tröskeln trots att det
 * är samma person, samma efternamn. Konkret bekräftat: August Erlingmark
 * (IFK Göteborg, spelar-id 289) missades helt av map-players.ts första
 * körning — 17 031 av 18 860 spelar-matchrader i Fas 5 hoppades över som
 * konsekvens.
 *
 * Fix: om vårt namn matchar "X. Efternamn"-mönstret, jämför EFTERNAMNET
 * separat mot Sportmonks strukturerade `lastname`-fält (inte hela namnet),
 * och verifiera att initialen matchar Sportmonks `firstname`s första
 * bokstav. Det är en mer träffsäker, namnkonventions-medveten jämförelse
 * än blind teckenavstånds-matchning över hela strängen.
 */
function parseInitialSurname(fullName: string): { initial: string; surname: string } | null {
  const m = fullName.trim().match(/^(\p{L})\.\s*(.+)$/u);
  if (!m) return null;
  return { initial: m[1], surname: m[2] };
}

export function playerNameSimilarity(
  ourFullName: string,
  sm: { firstname?: string | null; lastname?: string | null; name: string }
): number {
  const whole = nameSimilarity(ourFullName, sm.name);
  const parsed = parseInitialSurname(ourFullName);
  if (parsed && sm.lastname) {
    const surnameSim = nameSimilarity(parsed.surname, sm.lastname);
    const initialMatches = !!sm.firstname && normalize(sm.firstname)[0] === normalize(parsed.initial);
    if (surnameSim >= 0.85 && initialMatches) return Math.max(whole, 0.95);
    if (surnameSim >= 0.85) return Math.max(whole, 0.82);
  }
  return whole;
}
