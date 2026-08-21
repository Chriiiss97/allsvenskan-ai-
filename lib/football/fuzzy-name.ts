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
