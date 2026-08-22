# Ingestion

Hur data kommer från API-Football till Supabase. Se [API.md](API.md) för
endpoint-detaljer och begränsningar, [DATABASE.md](DATABASE.md) för
måltabeller.

## Körmodell — 🔴 manuell, ingen schemaläggning

Allt import körs manuellt av ägaren via `npm run import <steg>`
(`scripts/import/run.ts`). Ingen cron, ingen schemalagd Vercel-funktion,
ingen bakgrundsjobb-kö. `PROJEKT_BRIEF (1).md`s idé om "en gång per dygn
efter lansering" är 🔴 inte byggd.

```bash
npm run import              # 'all': league + teams + players + fixtures + facts (billiga steg, ~25 anrop för ursprungsscopet)
npm run import league        # bara liga/säsonger
npm run import teams         # ligavid: alla lag + arenor per säsong (1 anrop/säsong)
npm run import players       # per lag/säsong (flera anrop, paginerat)
npm run import fixtures      # ligavid: alla matcher per säsong (1 anrop/säsong)
npm run import events        # 1 anrop/MATCH — körs separat, kostar mycket
npm run import lineups       # 1 anrop/MATCH
npm run import team-stats    # 1 anrop/MATCH
npm run import player-stats  # 1 anrop/MATCH
npm run import coaches       # 1 anrop/LAG
npm run import standings     # 1 anrop/säsong
npm run import facts         # 0 API-anrop — manuellt insamlad klubb-/liganivåfakta
```

`'all'` kör medvetet INTE de matchnära, dyra stegen (events/lineups/
team-stats/player-stats) — de äter för mycket av dagskvoten och körs var för
sig.

## API-Football-klienten (`lib/api-football/client.ts`)

- **Throttle:** 250 ms mellan anrop (4/s). Historik: gratisplanens gräns var
  10/min (7 s), hårdkodad kvarlämning efter uppgraderingen till Ultra.
  Ändrad 2026-08-20 efter ett EMPIRISKT test (50 anrop i rad på 150 ms, 0
  st 429) — 250 ms valdes som säkerhetsmarginal under den testade gränsen,
  inte gissat. Utan fixet hade steg 4:s ~2900 anrop tagit ~5,6 timmar med
  den gamla 7s-throttlen.
- **429-hantering:** väntar 15 s och försöker igen, max 3 försök, kraschar
  sedan hela körningen hellre än att hänga oändligt.
- **Dagskvot:** loggar `x-ratelimit-requests-remaining` per anrop, avbryter
  proaktivt om ≤3 anrop kvar (för att inte gå över och riskera ett
  ofullständigt sista-anrop-svar).
- **Plangated data:** vissa endpoints/säsonger (t.ex. innevarande säsong på
  gratisplanen) svarar HTTP 200 med ett fyllt `errors`-objekt istället för
  en HTTP-felkod — klienten kollar explicit efter det.

## Återupptagbarhet — sync-kolumner, ett etablerat mönster

De matchnära, dyra importstegen (events/lineups/team-stats/player-stats)
kostar ett API-anrop VARDERA per match. Var och en har en egen
`fixture.<x>_synced_at`-kolumn: en avslutad match med kolumnen satt hoppas
över nästa körning, oavsett om matchen faktiskt gav några rader (annars
skulle mål-lösa matcher hämtas om varje gång — se kommentaren i migration
0004). Alla fyra scripten filtrerar dessutom på `status in ('FT','AET',
'PEN')` — bara avslutade matcher har fullständiga händelser/statistik.

`DEFAULT_MAX_FIXTURES_PER_RUN` (nu 3000, höjt från 800 samma dag som
scopet växte till 2016–2026: 800 var för lågt för de då 2549 avslutade
matcherna — körningen stannade tyst efter en delmängd trots att den
loggade "Klart", ett verkligt observerat fel, inte ett hypotetiskt).

## RAW-lagret är inte kopplat

`api_raw_response`-tabellen (se [DATABASE.md](DATABASE.md#tomma-tabeller))
skulle enligt planen spara varje dyrt API-svar rått som JSONB, så en
omtolkning senare inte kräver ett nytt API-anrop. **Ingen av
import-scripten skriver till den tabellen** — bekräftat genom kodsökning
(`grep -r api_raw_response scripts/` ger inga träffar). Samma sak gäller
`ingestion_log` — scripten loggar bara till `console.log`, ingen
strukturerad körningshistorik sparas i databasen. Regel för framtida arbete:
om du kopplar in RAW-loggning, gör det i samma transaktion/anrop som den
vanliga skrivningen (inte som ett separat efterhandsjobb) så de två aldrig
kan gå isär.

## Deduplicering / caches

Import-scripten delar tre "ensure/lookup"-cacher (in-memory Map +
databas-upsert vid cache-miss) för att slippa dubbelimportera samma entitet
när den dyker upp i flera matcher/spelare:

- `team-cache.ts` — lag (upsert på `external_id`)
- `player-cache.ts` — spelare (lookup, extraherad ur `import-events.ts` i
  steg 4 för att delas med lineups/player-stats)
- `venue-cache.ts` / `referee-cache.ts` — arenor/domare, samma mönster

## Ordningsberoenden

Import-stegen har underförstådda beroenden (ingen egen dependency-graf, bara
dokumenterat i koden och den här filen):

```
league  →  teams  →  players / fixtures  →  events / lineups / team-stats / player-stats
                            ↓
                        coaches, standings
```

`import-fixtures.ts`/`import-players.ts` kräver att `league`-steget körts
(slår upp `league.id`). `import-events.ts`/`import-lineups.ts`/
`import-team-stats.ts`/`import-player-stats.ts` kräver fixtures. Körs
`fixtures` innan `teams` finns lagen ännu inte, och `teamCache.ensure()`
skapar dem i farten som en fallback — men avsiktlig körordning (league →
teams → fixtures → matchnära steg) är säkrare.

## Pågående utökning: 2016–2026 (okommitterat)

Vid dokumentationstillfället (2026-08-20) finns okommitterade ändringar i
arbetsträdet (`git diff scripts/import/config.ts` m.fl. — 5 filer) som
utökar:

- `IMPORT_SEASONS`: `[2022, 2023, 2024]` → `[2016..2026]` (11 säsonger)
- `IMPORT_TEAMS`: 23 → 32 lag

Motivering i kodkommentaren: bekräftat att API:t inte har NÅGON
Allsvenskan-data före 2016, och att datan är rik så långt bak (spot-checkat
på fyra tidpunkter). En stray, ospårad fil (`scripts/player-stats-output.txt`,
968 rader terminal-output, inte en del av källkoden) visar en påbörjad
`player-stats`-körning mot det utökade scopet som **avslutas abrupt utan
ett "Klart"-meddelande** — indikerar en avbruten eller ännu pågående
körning, inte en bekräftat färdig import.

**Handlingsregel för framtida arbete:** anta INTE att 2016–2026/32 lag är
fullständigt importerat bara för att koden på disk säger det. Verifiera mot
den riktiga databasen (radantal i `fixture`/`statistics` per säsong,
`lineups_synced_at`/`player_stats_synced_at`-täckning) innan du bygger
någon funktion som förutsätter den bredare datan finns. Se
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md#viktig-nyans-på-nivå-1–2-committad-vs-okommitterad-kod).

## Regler för framtida ingestion-ändringar

1. Lägg aldrig till ett nytt fält genom att gissa API-Football:s
   svarsformat — verifiera mot ett riktigt testanrop först (samma princip
   som all annan kod i projektet, se `lib/api-football/types.ts`s
   kommentarer om "bekräftat i steg 1").
2. Ny matchnära import (kostar 1 anrop/match) ska alltid: (a) ha en egen
   `<x>_synced_at`-sync-kolumn, (b) filtrera på `status in ('FT','AET','PEN')`,
   (c) ha ett konfigurerbart `maxFixturesPerRun`-tak.
3. Om du kopplar in `api_raw_response`/`ingestion_log`, uppdatera den här
   filen (ta bort "RAW-lagret är inte kopplat"-varningen) i samma ändring —
   annars ljuger dokumentationen om koden.
4. Kör aldrig om `team-facts`/`league-facts`-seedningen med förändrad
   payload utan att komma ihåg att den gör delete+insert (inte upsert) —
   se `seed-team-facts.ts`.
