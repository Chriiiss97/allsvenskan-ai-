/**
 * Vilken liga, vilka säsonger och vilka lag import-scriptet hämtar.
 *
 * Gratisplanen på API-Football ger inte tillgång till innevarande säsong
 * (2026 vid skrivande stund — verifierat i praktiken, se README för import-
 * scriptet). 2022–2024 fungerar fullt ut. Byt/utöka IMPORT_SEASONS när ni
 * uppgraderar till PRO för att få in 2025/2026.
 */

export const ALLSVENSKAN_LEAGUE_EXTERNAL_ID = 113;

export const IMPORT_SEASONS = [2022, 2023, 2024] as const;

export const IMPORT_TEAMS = [
  { externalId: 366, name: "IFK Göteborg" },
  { externalId: 377, name: "AIK" },
] as const;
