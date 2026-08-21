/**
 * Sportmonks-motsvarigheten till config.ts — men för en genuint mindre
 * täckning. BEKRÄFTAT via riktiga /leagues/573?include=seasons-anrop denna
 * session, inte gissat: Sportmonks har BARA tre säsonger för Allsvenskan
 * (league_id 573) — 2024, 2025, 2026. Ingen historik bakåt till 2016 som vi
 * har på API-Football. SPORTMONKS_SEASON_IDS täcker alltså medvetet bara de
 * tre åren; 2016–2023 fortsätter vila helt på API-Football (se
 * scripts/import/config.ts:IMPORT_SEASONS), oförändrat.
 *
 * season_id är Sportmonks EGET internt id (helt orelaterat till vår egen
 * season.id eller till API-Footballs season-år) — bara en nyckel för att
 * fråga Sportmonks API, ingen databaskoppling i sig.
 */

export const SPORTMONKS_LEAGUE_ID = 573;

export const SPORTMONKS_SEASON_IDS: Record<2024 | 2025 | 2026, number> = {
  2024: 22960,
  2025: 24943,
  2026: 26806,
};

export const SPORTMONKS_SEASONS = [2024, 2025, 2026] as const;
