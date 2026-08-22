# Development Guide

Regler för att bygga vidare på projektet utan att bryta det som redan
fungerar eller duplicera det som redan finns. Läs
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) och [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
först om du inte redan har.

## Innan du kodar

1. **Läs `node_modules/next/dist/docs/` för den aktuella Next.js-versionen
   innan du skriver Next.js-kod.** Se `AGENTS.md`/`CLAUDE.md`: den här
   versionen av Next.js har brytande ändringar mot vad en modell kan tro
   den vet (t.ex. `proxy.ts` istället för `middleware.ts` — redan en
   observerad skillnad i det här projektet).
2. **Verifiera databasstrukturen innan du ändrar den.** `lib/supabase/database.types.ts`
   är handskriven, inte genererad — den kan halka efter en migration som
   skrevs men glömdes uppdatera i typfilen. Läs den relevanta
   migrationsfilen i `supabase/migrations/`, inte bara typfilen.
3. **Verifiera API-Football-fält mot ett riktigt testanrop innan du gissar
   ett svarsformat.** Detta projekts hela ingenjörskultur bygger på
   "bekräftat i steg 1"-kommentarer (se `lib/api-football/types.ts`) —
   fortsätt den vanan.
4. **Kontrollera om funktionen redan finns** i `lib/football/tools.ts`
   eller `lib/football/player-dna.ts` innan du skriver en ny frågelogik.
   Tre olika anropare (REST-routor, Data-sektionens server components,
   chattens tool-dispatch) delar redan samma implementationer — se
   [ARCHITECTURE.md](ARCHITECTURE.md). Duplicera aldrig frågelogik.

## Regler under kodning

- **Hitta aldrig på data.** Ingen fabricerad xG/Corsi/"game score" utan en
  verklig formel på verklig, importerad data. Detta är den mest
  återkommande, explicit uttalade regeln i hela projektets historik.
- **Dölj saknad data helt, visa den aldrig som en tom platshållare** (t.ex.
  "Ej tillgängligt"). Se `null`-hanteringen i `computePlayerDNA`/
  `getPlayerProfile` som referensmönster.
- **All UI-/systemprompt-text ska in i `lib/i18n/sv.ts`**, inte spridd som
  strängar i komponenter/routes — förbereder för framtida flerspråkighet
  utan att det byggs nu.
- **Permanent mörkt tema:** använd fasta hex-tokens (se
  [[allsvenskan-dark-theme-tokens]]), aldrig Tailwinds `dark:`-varianter,
  inuti `app/(app)/**`. Undantag: `/login`, `/onboarding`, `/auth/callback`,
  `/stats` ligger utanför den route-gruppen och använder fortfarande
  `dark:`-klasser — se "Kända inkonsekvenser" nedan.
- **Respektera RLS.** Fotbollsdata är publik läsning, personuppgifter är
  ägarskaps-/admin-scopade. Skriv aldrig fotbollsdata från klientkod — det
  ska alltid gå via service-role-nyckeln server-side (import-script,
  server actions), se [DATABASE.md](DATABASE.md#rls-principen-konsekvent-i-hela-schemat).
- **Ny matchnära import (1 anrop/match)** ska följa det etablerade
  återupptagbarhetsmönstret: egen `<x>_synced_at`-kolumn, filtrera på
  `status in ('FT','AET','PEN')`, konfigurerbart `maxFixturesPerRun`-tak.
  Se [INGESTION.md](INGESTION.md#regler-för-framtida-ingestion-ändringar).
- **Verifiera databurgar mot den riktiga vägen (route + databas), inte en
  isolerad diagnostik.** Se [[verify-tool-bugs-via-live-path]] — en
  historisk bugg (opponent-filter i `getFixtures`) syntes bara genom att
  köra det faktiska anropet, inte genom att läsa filtreringslogiken
  isolerat.

## Innan en större ändring — kontrollera beroenden

- Ändrar du `lib/football/position-group.ts` eller peer-urvalslogiken?
  Både `getPlayerProfile` (säsongsvis pool) och `computePlayerDNA`
  (poolad-över-säsonger) delar den — se
  [ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md#gemensam-infrastruktur-peer-jämförelse-libfootballposition-groupts)
  för den medvetna skillnaden mellan de två, rätta den inte av misstag.
- Ändrar du `hasPlayedSeason()` (aktiv-spelare-regeln)? Den används
  konsekvent på flera ställen (spelarlista, säsongsväljare, trupp) MED ett
  fåtal medvetna, dokumenterade undantag (admins råa datatäckning,
  spelarsöket i "Jämför spelare"). Se `lib/football/active-player.ts`s
  egen kommentar för hela listan innan du "fixar" ett av undantagen.
- Vill du bredda lag-vs-lag/lagprofil till fler lag? Ändra
  `COMPARABLE_TEAM_EXTERNAL_IDS` i `lib/football/tools.ts` — datan finns
  troligen redan (se [INGESTION.md](INGESTION.md)), verifiera bara att
  full matchhistorik faktiskt är importerad för de nya lagen först.

## Håll dokumentationen i synk

| Om du ändrar... | ...uppdatera |
|---|---|
| `supabase/migrations/*.sql` (ny tabell/kolumn) | [DATABASE.md](DATABASE.md), `lib/supabase/database.types.ts` |
| `scripts/import/*.ts` (nytt steg, ändrad scope) | [INGESTION.md](INGESTION.md), [DATA_CATALOG.md](DATA_CATALOG.md) |
| `lib/football/player-dna.ts` | [PLAYER_DNA.md](PLAYER_DNA.md) |
| `lib/football/tools.ts` (ny/ändrad funktion) | [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md) och/eller [ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md) beroende på vad funktionen gör |
| Nytt API-Football-fält/endpoint tas i bruk | [API.md](API.md), [DATA_CATALOG.md](DATA_CATALOG.md) |
| En roadmap-post går från planerad → byggd | [ROADMAP.md](ROADMAP.md) — flytta posten, skriv inte om den på plats |
| `COMPARABLE_TEAM_EXTERNAL_IDS`/produktens lagbredd ändras | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#två-olika-bredder-i-samma-databas--viktigt-att-förstå) |

## Kända inkonsekvenser (dokumenterade, inte tysta)

- `/login`, `/dev-login`, `/onboarding` använder Tailwinds `dark:`-varianter
  och ligger utanför `app/(app)/`s permanent-mörka layout — de anpassar sig
  fortfarande efter systemets ljus/mörkt-inställning, till skillnad från
  resten av appen. Inte åtgärdat, lågrisk (pre-auth-sidor, litet UI-yta).
- `app/dev-login/page.tsx` är en tillfällig lösenords-inloggning, explicit
  markerad i sin egen filkommentar att tas bort innan lansering — finns
  fortfarande kvar.
- `app/stats/page.tsx` — en tidig, publik (ingen auth-koll), oautentiserad
  rådata-förhandsvisning byggd innan Data-sektionen fanns. Fortfarande i
  koden, fortfarande nåbar utan inloggning; oklart om den fortfarande fyller
  ett syfte nu när `app/(app)/data/**` finns.
- `api_raw_response`/`ingestion_log`-tabellerna existerar men är oanvända —
  se [DATABASE.md](DATABASE.md#tomma-tabeller). Antingen koppla in dem eller
  ta bort dem ur schemat; att låta dem stå oanvända på obestämd tid gör
  schemat vilseledande för nästa läsare.
- Okommitterade ändringar i `scripts/import/*.ts` representerar en pågående
  scope-utökning (2016–2026, 32 lag) som inte är verifierad klar — se
  [ROADMAP.md](ROADMAP.md#in-progress-🟡). Committa eller dokumentera
  varför den är kvar okommitterad, hellre än att låta den ligga obestämt.
- `scripts/player-stats-output.txt` är en spårad terminal-loggfil, inte
  källkod (`git status` visar den som `??`, ospårad). Den borde antingen
  läggas till `.gitignore` eller tas bort — den ger inget värde kvar i
  repot.

## Vad du INTE ska göra utan att fråga

- Ändra `IMPORT_SEASONS`/`IMPORT_TEAMS` och köra en stor importkörning utan
  att förstå dagskvotens påverkan — se [INGESTION.md](INGESTION.md) och
  [API.md](API.md) för kvot-/throttling-detaljer.
- Bredda chattens `FOOTBALL_TOOLS`-lag-enum eller Player DNA:s produktscope
  utan att först bekräfta att full data (matchhistorik, statistik) faktiskt
  finns för de nya lagen — se [ROADMAP.md](ROADMAP.md).
- Skriva om `increment_message_quota`/`handle_new_user`-funktionerna utan
  att testa mot en riktig inloggad användare — båda har redan orsakat
  produktionskrascher en gång (se [DATABASE.md](DATABASE.md#kända-databuggar-redan-fixade-historik-inte-öppna-problem)).
