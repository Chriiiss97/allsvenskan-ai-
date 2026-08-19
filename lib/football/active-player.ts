/**
 * LÅST definition (konversation 2026-08-20) för "aktiv spelare" i Player
 * Database. Bakgrund: API-Football:s statistics-rader inkluderar ALLA som
 * var registrerade för en klubb en säsong — provspelare, reserver,
 * spelare som lämnade innan säsongsstart — inte bara de som faktiskt
 * spelade. Att räkna raderna rakt av gav uppblåsta, missvisande antal
 * (t.ex. "102 spelare" för ett lag på en säsong, mot en verklig trupp på
 * ~25–35).
 *
 * Reglerna:
 *   1. En spelare räknas som aktiv för EN specifik säsong bara om de har
 *      minst ett framträdande (appearances > 0) den säsongen.
 *   2. För "Alla säsonger" räknas en spelare om de hade minst ett
 *      framträdande under NÅGON av de importerade säsongerna (2022–2024).
 *
 * Används konsekvent av: spelarlistans antal, lag-/säsongsfiltren,
 * sorteringen (app/(app)/data/players/page.tsx), och lagprofilens
 * truppsektion (getTeamProfile nedan). Spelarprofilens säsongsväljare
 * (getPlayerProfile.availableSeasons) filtrerar på samma sätt, så den
 * aldrig erbjuder en "spökssäsong" spelaren i praktiken inte spelade.
 *
 * Medveten, tydligt märkt AVVIKELSE: adminpanelens "Datatäckning"-sektion
 * (app/(app)/admin/page.tsx) visar avsiktligt RÅ importtäckning (totalt
 * antal player-rader i databasen) — det är en teknisk täckningssiffra,
 * inte ett påstående om aktiv trupp, och etiketten säger "Datatäckning"
 * snarare än "Spelare i Player Database". Spelarväljaren i "Jämför
 * spelare" (PlayerCompareControls/PlayerPicker) listar också alla
 * importerade spelare oavsett framträdanden — det är ett fritextsök för
 * att slå upp EN namngiven spelares profil, inte en antalsstatistik, så
 * samma regel gäller inte där.
 */
export function hasPlayedSeason(appearances: number): boolean {
  return appearances > 0;
}
