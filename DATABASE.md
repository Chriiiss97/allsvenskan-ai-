# Database

Hur man ska förstå och använda Supabase-datamodellen. Inte en kopia av SQL:en
— läs `supabase/migrations/*.sql` för exakta kolumntyper/constraints. Det
här dokumentet förklarar syfte, relationer och (viktigast) vilka tabeller
som faktiskt har data i sig kontra bara finns som tomt schema.

Migrationer körs manuellt i Supabase SQL Editor, i filnamnsordning (se
`SETUP.md`). Det finns ingen levande `supabase link`; `lib/supabase/database.types.ts`
är handskriven och måste uppdateras för hand vid varje schemaändring — se
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md#viktig-nyans-på-nivå-2-schema-filer-vs-körd-databas)
för risken att en migrationsfil finns i repot utan att vara körd på riktigt.

## Kärnschema (`football_schema`, migration 0002) — 🟢 i aktiv användning

```
league ──< season ──< fixture >── team (home/away)
  │                      │
  │                      ├──< event (mål/kort/byten)
  │                      │
  └──< league_fact       └──< statistics >── player
                                              │
team ──< team_trophy                          └── current_team_id → team
team ──< team_legend
team ──< team_rivalry (self-referens: rival_team_id → team)
```

- **`league`/`season`** — säsongs-/liga-agnostiskt med avsikt (se
  `PROJEKT_BRIEF (1).md`): inget hårdkodat "2026" i tabellnamn, så fler
  ligor kan läggas till utan schemaändring. I praktiken finns bara
  Allsvenskan (`external_id = 113`) importerad.
- **`team`** — `nicknames text[]` (GIN-index) är nyckeln till att
  chatboten förstår "Blåvitt"/"Gnaget"; `resolveTeam()` normaliserar bort
  diakritik på båda sidor eftersom API-Football ger lagnamn utan ö/ä/å
  (fixat i data för 8 lag via migration 0012, se `git log` för detaljer).
- **`statistics`** — SÄSONGSAGGREGERAD spelarstatistik, en rad per
  `(player_id, team_id, league_id, season_id)`. `league_id` är nyckeln som
  ger tävlingsuppdelning (Allsvenskan vs. ev. cup). Detta är den ÄLDRE,
  grövre statistiktabellen — se `fixture_player_stats` nedan för
  per-match-nivå.
- **`event`** — mål/kort/byten per match, `unique (fixture_id, player_id,
  minute, type, detail)` förbereder för framtida live-uppdatering utan
  dubbletter (live-delen är själv inte byggd, se ARCHITECTURE.md). Känd
  datalucka: mål är systematiskt underrapporterade i API-Football:s
  historiska data (se [DATA_CATALOG.md](DATA_CATALOG.md#matchhändelser)).

## Matchdjup-schema (`match_depth_schema`, migration 0014) — 🟢 tabeller byggda och fyllda, 🟡 vissa tomma

Tillagt 2026-08-20 ("Ultra-planen", steg 2/10) för match-nivå-granularitet
istället för bara säsongssummeringar.

```
venue ──< team (venue_id)
venue ──< fixture (venue_id)
referee ──< fixture (referee_id)
coach ──< fixture_lineup ──< fixture_lineup_player >── player
fixture ──< fixture_player_stats >── player   (PER MATCH, skiljer sig från statistics)
fixture ──< fixture_team_stats                (PER MATCH lagstatistik, inkl. expected_goals!)
fixture ──< fixture_live_snapshots            (tidsserie, append-only — se "tomma tabeller")
player ──< player_injury                      (se "tomma tabeller")
season ──< standings >── team                 (append-only snapshot)
api_raw_response                              (se "tomma tabeller")
ingestion_log                                 (se "tomma tabeller")
```

Fyra nya sync-flaggor på `fixture`: `events_synced_at` (migration 0004,
äldre), `lineups_synced_at`, `statistics_synced_at`, `player_stats_synced_at`
(migration 0014) — varje import-script är återupptagbart: hoppar över
matcher som redan har sin flagga satt, oavsett om matchen faktiskt gav några
rader. Se [INGESTION.md](INGESTION.md).

**Oväntat fynd, bekräftat i kod:** `fixture_team_stats.expected_goals`/
`goals_prevented` är RIKTIGA fält från API-Football (lagnivå, inte
spelarnivå) — ändrade flera "omöjligt"-bedömningar i planeringen till
"redan rådata, bara oanvänd i UI:t ännu". Se
[DATA_CATALOG.md](DATA_CATALOG.md#expected-goals-xg).

### Tomma tabeller — schema finns, ingen kod skriver till dem

Bekräftat genom kodsökning (`grep` efter tabellnamnen i `scripts/`, `lib/`,
`app/`) — dessa tabeller är **🟡 planerat, inte implementerat**, trots att
migrationen är skriven och (om körd) tabellen existerar tom i databasen:

| Tabell | Tänkt syfte | Varför tom |
|---|---|---|
| `api_raw_response` | RAW-lagret — spara varje dyrt API-svar (events/lineups/statistics/player-stats) som JSONB för omhämtningsfri felsökning | Inget import-script gör en insert hit — se [INGESTION.md](INGESTION.md#raw-lagret-är-inte-kopplat) |
| `ingestion_log` | En rad per körning/batch: calls_used, rows_written, status — grunden för en framtida "calls-budget"-vy | Inget import-script loggar hit — scripten loggar bara till `console.log` |
| `player_injury` | Skadehistorik (`kind: 'sidelined' \| 'matchstatus'`, från `/sidelined` resp. `/injuries`) | Inget `import-injuries.ts` finns |
| `fixture_live_snapshots` | Tidsserie under en pågående match (för framtida Match DNA-momentum) | Kräver en live-poller som inte är byggd; kan per design bara fyllas FRAMÅT i tiden, aldrig retroaktivt för redan spelade matcher |

`standings` är append-only men FÅR data (via `import-standings.ts`) — skiljer
sig från listan ovan genom att faktiskt ha ett körbart importsteg, bara med
begränsat värde för redan avslutade säsonger (en snapshot per körning istället
för en verklig tidsserie).

## Auth & produkttabeller — 🟢 i aktiv användning

- **`profiles`** — speglar `auth.users`, `role` (`user`/`admin`),
  `daily_message_count`/`quota_date` (gratiskvot), `favorite_team_id`,
  `onboarding_completed_at`. Inga UPDATE-policyer på `role` från klienten —
  bara `SECURITY DEFINER`-funktioner (`handle_new_user`, `set_favorite_team`)
  kan ändra profilrader, så ingen klient kan självutnämna sig till admin.
- **`conversation`/`message`** — chatthistorik, RLS: en användare ser bara
  sina egna, admin ser alla (`is_admin()`-funktionen).
- **`unanswered_questions`** — loggade frågor chatten inte kunde besvara,
  admin-only läsning, `resolved`/`admin_notes` hanteras i adminpanelen.
- **`message_tool_call`/`message_usage`** (migration 0013) — en rad per
  verktygsanrop respektive per assistant-svars token-/kostnads-/svarstidsdata.
  Driver adminpanelens "Vad frågar användarna om"/"AI-status". `/api/chat`
  skriver hit "best effort" (ignorerar fel om migrationen inte är körd).
- **`feature_flag`** — on/off-mekanism, en seedad rad (`chat_enabled`),
  faktiskt kopplad i `/api/chat` (kollas innan varje svar).

## RLS-principen, konsekvent i hela schemat

Fotbollsdata (league/team/player/fixture/statistics/venue/coach/...) är
**publik läsdata** — `for select using (true)` på alla dessa tabeller.
Skrivning sker ALDRIG från klienten, bara server-side med service-role-nyckeln
(import-scripten, adminets server actions) som kringgår RLS helt — därför
finns inga INSERT/UPDATE/DELETE-policyer för fotbollsdata.

`api_raw_response`/`ingestion_log` har `enable row level security` men
**ingen policy alls** — Postgres RLS defaultar då till "ingen åtkomst utom
service role". Medvetet: de är drift/diagnostik, inte produktdata.

Personuppgiftstabeller (`profiles`, `conversation`, `message`,
`message_tool_call`, `message_usage`, `unanswered_questions`) har
ägarskaps- eller admin-scopade policyer — se respektive migrationsfil för
exakt villkor.

## Triggers och funktioner värda att känna till

| Funktion | Vad den gör |
|---|---|
| `set_updated_at()` | Generisk trigger, sätter `updated_at = now()` — återanvänd av nästan alla tabeller med den kolumnen |
| `handle_new_user()` | Körs efter `auth.users`-insert, skapar `profiles`-raden, sätter `role='admin'` bara för ägarens e-post |
| `is_admin()` | `SECURITY DEFINER`, används i RLS-policyer för att undvika rekursiva policy-lookups |
| `increment_message_quota(p_daily_limit)` | Atomär kvot-räknare (radlås `FOR UPDATE`), nollställer per datum, undantar admin |
| `set_favorite_team(p_team_id)` | Enda vägen för en klient att sätta sitt favoritlag — skopad hårt till `auth.uid()`, rör aldrig `role` |

## Kända databuggar, redan fixade (historik, inte öppna problem)

Dokumenterade här eftersom de är läroexempel på "verifiera mot riktig
körning" — se migration 0007 (`handle_new_user()` CASE-typning fick ALLA
inloggningar att faila), migration 0010 (`increment_message_quota()`
kolumn-tvetydighet mellan OUT-parameter och tabellkolumn), och migration
0012 (saknade svenska diakritiska tecken i lagnamn från API-Football).
