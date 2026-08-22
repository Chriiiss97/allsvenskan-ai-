# API-Football Integration

API-Football v3 (api-sports.io), bas-URL `https://v3.football.api-sports.io`,
header `x-apisports-key`. Full extern dokumentation:
https://api-sports.io/documentation/football/v3. Det här dokumentet listar
vad VI faktiskt använder och vad vi VERIFIERAT att API:t inte ger — se
[DATA_CATALOG.md](DATA_CATALOG.md) för vad det betyder på datanivå och
[INGESTION.md](INGESTION.md) för hur klienten/throttlingen fungerar.

## Plan och kvot

- **Plan:** Ultra (75 000 anrop/dag), uppgraderad från gratisplanens
  100/dag under datalagerprojektet (2026-08-20). `PROJEKT_BRIEF (1).md`s
  ursprungliga pris-jämförelse (Free/PRO/ULTRA/MEGA) är historisk kontext,
  inte aktuell status — Ultra är redan köpt och i bruk.
- **Anrop/minut:** empiriskt testat till minst 4/s säkert (250 ms throttle
  i klienten) — se [INGESTION.md](INGESTION.md).
- **Plangated data:** innevarande säsongs data kan vara planbegränsad även
  på Ultra för vissa ligor — API:t svarar då HTTP 200 med ett fyllt
  `errors`-objekt, inte en HTTP-felkod. Klienten kollar explicit efter det
  (`hasErrors()` i `lib/api-football/client.ts`).

## Endpoints som faktiskt används

| Endpoint | Används av | Vad vi sparar | Kostnad |
|---|---|---|---|
| `/leagues?id=113` | `import-league.ts` | `league`, `season`-rader | 1 anrop |
| `/teams?league=&season=` | `import-teams.ts` | `team` + inbäddad `venue` | 1/säsong |
| `/players?team=&league=&season=` (paginerad) | `import-players.ts` | `player`, `statistics` (säsongsaggregerat) | flera/lag/säsong |
| `/fixtures?league=&season=` | `import-fixtures.ts` | `fixture` (+ `venue`/`referee` via cache) | 1/säsong |
| `/fixtures/events?fixture=` | `import-events.ts` | `event` | 1/MATCH |
| `/fixtures/lineups?fixture=` | `import-lineups.ts` | `fixture_lineup`, `fixture_lineup_player` | 1/MATCH |
| `/fixtures/statistics?fixture=` | `import-team-stats.ts` | `fixture_team_stats` (inkl. xG) | 1/MATCH |
| `/fixtures/players?fixture=` | `import-player-stats.ts` | `fixture_player_stats` | 1/MATCH |
| `/coachs?team=` | `import-coaches.ts` | `coach` | 1/lag |
| `/standings?league=&season=` | `import-standings.ts` | `standings` (append-only snapshot) | 1/säsong |

## Endpoints nämnda i planen men INTE använda

```
/injuries, /sidelined   → 🟡 schema finns (player_injury), ingen importkod
/odds                    → 🔴 aldrig hämtad, ingen tabell
/transfers, /trophies    → 🔴 aldrig hämtad
/players/topscorers,
/players/topassists,
/players/topyellowcards,
/players/topredcards     → 🔴 aldrig hämtade — vi beräknar detta SJÄLVA från
                            importerad statistics istället (getTopScorers/
                            getCards i lib/football/tools.ts), så dessa
                            endpoints var aldrig nödvändiga
```

## Bekräftade API-begränsningar (verifierat mot riktiga testanrop, inte antaget)

Källa för alla punkter nedan: en dokumenterad verifieringsrunda (steg 1 i
datalagerprojektet) mot en riktig avslutad match (AIK–Halmstad
2024-11-10). Se kommentarerna i
`supabase/migrations/20260820120000_match_depth_schema.sql` och
`lib/api-football/types.ts`.

- **Ingen spatial/koordinatdata i `/fixtures/events`** — inga x/y, ingen
  skotttyp. Skottkartor är permanent omöjliga med den här datakällan. Se
  [DATA_CATALOG.md](DATA_CATALOG.md#spatial-data--skottkartor).
- **`/fixtures/statistics` har RIKTIGA `expected_goals`/`goals_prevented`-fält**
  — LAGNIVÅ, inte spelarnivå. Ett positivt, oväntat fynd — se
  [DATA_CATALOG.md](DATA_CATALOG.md#expected-goals-xg).
- **`/fixtures/statistics` är tidsstämpellös** — ingen halvleksuppdelning,
  ingen historik. En momentum-/matchkurva måste byggas SJÄLV framåt i tiden
  via upprepad polling (`fixture_live_snapshots`, tom idag) — kan aldrig
  rekonstrueras retroaktivt.
- **`/coachs` gav två separata poster för samma verkliga person** i
  verifieringstestet (olika `external_id`, en rik/en nästan tom post).
  Ingen tillförlitlig databas-constraint löser detta — kräver aktiv
  deduplicering i import-koden, inte byggd.
- **`fixture.referee` är bara en fri textsträng** — ingen egen
  domar-endpoint, inget externt ID. Matchning sker på exakt namn (känd
  svaghet: stavningsvarianter dedupas inte).
- **`/injuries` och `/sidelined` är två olika, bekräftat separata
  endpoints** (matchbunden status vs. datumintervall) — inte samma data i
  två format.
- **`live=all` bekräftat fungerande** (en poll täcker alla samtidigt
  pågående matcher) — relevant för en framtida live-poller, men den är inte
  byggd.
- **Historisk täckning:** ingen Allsvenskan-data alls före 2016
  (`/leagues?id=113` listar 2016 som äldsta säsong). Datan är rik så långt
  bak (spot-checkat lineups/statistik/events på fyra punkter: 2016/2017/
  2019/2021), med ett känt undantag: `/fixtures/players` var tom för ETT
  2016-matchs stickprov — matchar en redan känd typ av gles täckning i
  äldre data, inte ett nytt problem.
- **`passes_accuracy` saknas för 83–90 % av spelarna** i `/players`-svaret
  — inte ett importfel, en äkta täckningslucka i källdatan för Allsvenskan.
- **Mål (inte kort/byten) är systematiskt underrapporterade** i
  `/fixtures/events` för äldre matcher — se
  [DATA_CATALOG.md](DATA_CATALOG.md#matchhändelser).

## Regler för framtida API-arbete

1. Verifiera alltid ett nytt fält/endpoint mot ett riktigt testanrop innan
   du bygger schema/import runt det — gissa aldrig ett API-svarsformat. Se
   `lib/api-football/types.ts`s "bekräftat i steg 1"-kommentarer som
   mönster att följa.
2. Om API:t svarar 200 med ett `errors`-objekt, det är fortfarande ett fel
   — kontrollera `hasErrors()`, lita inte på HTTP-statuskoden ensam.
3. Nya matchnära endpoints (kostar 1 anrop/match) ska följa samma
   återupptagbarhetsmönster som events/lineups/team-stats/player-stats —
   se [INGESTION.md](INGESTION.md#regler-för-framtida-ingestion-ändringar).
