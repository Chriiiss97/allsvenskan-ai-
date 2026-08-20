# API Gap Analysis — vad vi inte använder än

**Status:** Ren inventering + verifiering. Inget byggt. Sparat 2026-08-20.

**Metod:** API-Football/api-sports.io:s dokumentationssajt blockerade automatiserad hämtning (403 på varje försök, inklusive nyhetssidor). Istället för att gissa utifrån minne eller sekundära källor verifierades allt nedan med **riktiga testanrop mot API:t**, mot Allsvenskan-data (lag, spelare, matcher vi redan har importerade) — en starkare grund än dokumentation ändå, eftersom det visar exakt vad VÅR nyckel/tier faktiskt returnerar för VÅR liga, inte vad marknadsföringstexten påstår generellt. Sökresultat användes bara för att hitta rätt endpoint-NAMN att testa, aldrig för att avgöra om något fungerar.

**Redan använt** (inte upprepat här): `/fixtures`, `/fixtures/events`, `/fixtures/lineups`, `/fixtures/statistics`, `/fixtures/players`, `/players`, `/teams`, `/venues`, `/coachs`, `/standings`, `/injuries`, `/sidelined`, `/trophies`, `/transfers`, `/leagues`, `/fixtures?live=all`.

---

## Del 1 — Nya endpoints, verifierade

| Endpoint | Vad den ger | 2016–2026? | Kostnad | Nya analyser | USP vs FotMob/Sofascore | Tillförlitlig grund | Status |
|---|---|---|---|---|---|---|---|
| `/predictions` | Vinnare, over/under, procent hemma/oavgjort/borta, "advice"-text, rik form/historik-data inbäddad | 🟢 Ja — testat på 5 slumpmässiga 2024-matcher, 5/5 träff. Historiskt retained, till skillnad från odds. | 1 anrop/match, ~2 549 för hela historiken | Jämför API:ts EGEN modell mot vår egen analys — ett andra, oberoende "facit" att mäta våra insikter mot | Låg egen — det här är API:ts modell, inte vår. Värdet är som REFERENS, inte som vår produkt. | Hög — verkligt data, inte gissat | 🟢 |
| `/fixtures/headtohead` | Senaste N möten mellan två lag | 🟢 Ja, testat (AIK–IFK) | Låg | I princip inget — vi har redan HELA mötesuppsättningen i vår egen `fixture`-tabell, en SQL-fråga ger samma sak utan API-anrop | Ingen — ren dubblett av data vi redan äger | Hög, men irrelevant | 🔴 (redundant, inte "ej möjligt" — bara onödig) |
| `/players/topscorers`, `/topassists`, `/topyellowcards`, `/topredcards` | Rankade topplistor per säsong | 🟢 Ja, alla fyra testade | Låg | I princip inget nytt — vi kan redan rangordna `statistics`-tabellen själva (och gör det, `get_top_scorers`/`get_cards`) | Ingen | Hög, men redundant | 🔴 (redundant) |
| `/players/squads` | Aktuell trupp (namn/nummer/position/foto), inget statistik | 🟢 Ja, testat (AIK) | Låg | Marginellt — vi bygger redan en mer korrekt "aktiv trupp" via `hasPlayedSeason`, den här ger bara en ohederligt osäker "registrerad just nu"-lista | Ingen | Medel | 🔴 (redundant, sämre än vår egen definition) |
| `/fixtures/rounds` | Lista över omgångsetiketter | 🟢 Ja, testat | Låg | Inget — vi har redan `fixture.round` per match | Ingen | Hög, men redundant | 🔴 (redundant) |
| `/odds`, `/odds/live`, `/odds/bets`, `/odds/bookmakers`, `/odds/live/bets`, `/odds/mapping` | Marknadens odds, pre-match och live | 🟡 Delvis — se **Market & Expectation Layer** nedan, egen sektion | Låg per anrop, men kräver FRAMTIDA kontinuerlig insamling | Stor — en hel ny analysdimension | Hög, om vi bygger den rätt — se nedan | Verifierat mekaniskt, men INTE historiskt tillgänglig | 🟡 |

**Sammanfattning del 1:** Utanför oddsfamiljen finns ingen genuint ny datakälla vi missat — allt annat som testades är antingen redan täckt av vår egen databas eller en ren dubblett av ett API-anrop vi kan ersätta med en SQL-fråga (billigare och snabbare). Det enda verkligt nya är `/predictions` (svag, men en bra oberoende referenspunkt) och odds-familjen (stor, men bara framåtriktad — se nedan).

---

## Del 2 — Data vi redan hämtar men inte utnyttjar fullt ut

| Fält/tabell | Status | Var det syns (eller inte) |
|---|---|---|
| `fixture_lineup_player.grid` | Importerad (steg 4) | Inte använd i någon produktfunktion än — det här är den riktiga sub-positionsdatan (t.ex. "2:1" vs "2:4" på en backlinje) som skulle kunna lösa "falsk precision"-problemet i Player DNA:s positionsindelning. |
| `fixture_team_stats.expected_goals`/`goals_prevented` | Importerad (steg 4) | Inte använd — grunden för en äkta Team DNA/Match DNA-överprestationsanalys, se tidigare plan-uppdatering. |
| `fixture_player_stats.dribbles_past` | Importerad (steg 4) | Inte använd — ett defensivt sårbarhetsmått ("blev dribblad förbi"), aldrig synligt någonstans. |
| `coach` + `fixture_lineup.coach_id` | Importerad (steg 3–4) | Inte kopplad till någon analys — grunden för "manager effect" i Insight Engine-backloggen finns redan, används inte. |
| `standings.form` | Importerad (steg 3) | Sträng som "WLWWL" — aldrig visad eller använd i någon formkurva. |
| `score.halftime/extratime/penalty` | **Bekräftat tillgängligt (steg 1), men INTE importerat** — medvetet avgränsat bort då för att undvika en extra migrationsrunda, inte bortglömt. | Kvarstående, billig quick-win om det blir relevant för Match DNA. |
| `passes_accuracy` | Importerad men bara 10–17 % ifylld | Medvetet exkluderad från Player DNA:s benchmarking (för gles) — korrekt beslut, inte en lucka. |

---

## Del 3 — Prioriterad topplista

Rangordnat efter en kombination av wow-faktor för fans och betalningsvärde för klubbar/scouting — inte bara vad som är tekniskt enkelt.

1. **Market & Expectation Layer, grundskiktet** (pre-match-oddssnapshots, framåt) — hög wow ("var det här en överraskning?"), högt klubb-värde (motståndaranalys). Se egen sektion.
2. **`fixture_lineup_player.grid` → riktiga underpositioner i Player DNA** — löser en tidigare, uttryckligen flaggad begränsning ("falsk precision"). Billigt, datan finns redan.
3. **`expected_goals`/`goals_prevented` → Team DNA/Match DNA-överprestation** — datan finns redan sedan steg 4, väntar bara på analysmotorn (steg 8–9).
4. **`/predictions` som oberoende jämförelsepunkt** — "API:ts modell sa X, verkligheten blev Y" är en billig, trovärdig extra rad i en matchrapport.
5. **Coach-kopplad "manager effect"** — datan finns, kräver bara att kopplas ihop i analysmotorn.
6. **`dribbles_past` i Player DNA:s försvarskategori** — litet, men stänger en känd databrist.
7. **`standings.form` i UI:t** — trivial att visa, redan importerad.
8. **`score.halftime` i matchrapporter** ("så vände matchen i halvtid") — kräver en liten schematillägg, annars klart.

Punkt 1 är den enda som kräver ny infrastruktur (framtida datainsamling). Punkt 2–8 är redan-hämtad data som väntar på att kopplas in — billigare och snabbare värde än att jaga fler externa datakällor.

---

## Market & Expectation Layer

### 1. Inventering och verifiering — svar på de tio frågorna

Allt nedan är verifierat med riktiga anrop mot Allsvenskan-data, inte läst i dokumentation.

1. **Oddsmarknader:** `/odds/bets` gav 338 marknadstyper i den globala katalogen (Match Winner, Home/Away, Over/Under, Second Half Winner, m.fl.) — inte alla nödvändigtvis erbjudna för varje Allsvenskan-match, men katalogen är rik.
2. **Bookmakers:** `/odds/bookmakers` gav 33 st (10Bet, Marathonbet, Betfair, m.fl.).
3. **Pre-match odds tillgängliga:** 🟢 **Ja, bekräftat** — testat på 5 kommande Allsvenskan-matcher (21–23 aug 2026), alla fem hade odds från flera marknader, senast uppdaterade samma dag som testet.
4. **Hur långt bak historisk oddsdata finns:** 🔴 **Ingenting.** Testat på en 2024-match (AIK–Halmstad) och en 2016-match — båda gav `results: 0`, helt tomt.
5. **Odds för 2016–2026 historiskt:** 🔴 **Nej**, se punkt 4 — konsekvent nej oavsett hur nyligen matchen spelades.
6. **Vad `/odds/live` returnerar för en pågående match:** 🟢 Bekräftat mekaniskt (ingen Allsvenskan-match var live vid testtillfället, så verifierat mot en match i en annan liga) — rik marknadsdata per bookmaker: `value`, `odd`, `handicap`, `main`, `suspended`, uppdaterat med en tidsstämpel.
7. **Bet-typer för live odds:** `/odds/live/bets` gav 266 marknadstyper — en EGEN katalog, skild från pre-match-katalogens 338.
8. **Uppdateringsfrekvens i praktiken:** Ej mätbart utan en pågående Allsvenskan-match att polla upprepade gånger — kvarstår att verifiera under steg 6 (live-pipelinen).
9. **Kan samma fixture följas över tid, snapshot-identifiering:** 🔴 **Nej, inte inbyggt.** Precis som `fixtures/statistics` (steg 1) är svaret en tidsstämpellös ÖGONBLICKSBILD (ett `update`-fält med senaste tidpunkt, ingen historik-array). Vi måste bygga vår egen tidsserie om vi vill ha en kurva.
10. **Begränsningar:** (a) ingen historisk retention alls — odds finns bara i ett fönster före avspark och försvinner efter; (b) live-täckning för Allsvenskan specifikt är overifierad (mekaniken fungerar, men ingen Allsvenskan-match har testats live än); (c) 33 bookmakers är en global lista, inte en garanti att alla täcker Allsvenskan specifikt.

**Den viktigaste slutsatsen:** odds är INTE en historisk datakälla för oss. Allt värde i det här lagret måste byggas **framåt i tiden**, från och med den dag vi börjar samla in det — exakt samma princip som `fixture_live_snapshots` redan är byggd kring.

### 2. Viktig princip

Bekräftat och efterlevs: det här är en analytisk signal ovanpå vårt fotbollsdatalager, inte en bettingprodukt. Ingen odds-UI, ingen "spela på det här"-funktion. Frågorna vi vill svara på är EXPECTATION → REALITY → REACTION → CONSEQUENCE → PATTERN, inte "vilken sida ger bäst odds".

### 3. Datamodell (förslag, väntar på beslut — inget skapat)

Följer samma RAW → CANONICAL-princip som resten av datalagret.

```sql
-- CANONICAL: en rad per bookmaker+marknad+värde, en snapshot i taget.
-- Fylls FRAMÅT, aldrig retroaktivt (odds finns inte historiskt, se punkt 4).
create table public.fixture_odds (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture(id) on delete cascade,
  captured_at timestamptz not null default now(),
  bookmaker_id integer not null,       -- API:ts egna bookmaker-id (33 st, se /odds/bookmakers)
  bookmaker_name text not null,
  bet_id integer not null,             -- API:ts egna bet-id (t.ex. 1 = "Match Winner")
  bet_name text not null,
  value text not null,                 -- t.ex. "Home", "Over 2.5"
  odd numeric(6,2) not null,
  handicap text,                       -- null om ej tillämpligt
  is_main boolean,
  is_suspended boolean not null default false
);
create index fixture_odds_fixture_idx on public.fixture_odds (fixture_id, captured_at);

-- CANONICAL: tidsserie under en pågående match — samma append-only-princip
-- som fixture_live_snapshots. En rad per avläsning per marknad, inte en
-- uppdaterad rad.
create table public.fixture_live_odds_snapshots (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture(id) on delete cascade,
  captured_at timestamptz not null default now(),
  match_minute integer,
  game_state text,                     -- t.ex. "1-0 home leading" — härlett vid infångningstillfället
  bookmaker_id integer not null,
  bet_id integer not null,
  bet_name text not null,
  value text not null,
  odd numeric(6,2) not null,
  is_suspended boolean not null default false
);
create index fixture_live_odds_fixture_idx on public.fixture_live_odds_snapshots (fixture_id, captured_at);

-- RAW: precis som api_raw_response, JSONB-kopia av det faktiska svaret —
-- odds-payloads är rika (flera bookmakers × flera marknader), värt att
-- bevara helheten, inte bara det normaliserade utdraget.
-- (Återanvänder befintlig api_raw_response-tabell, ingen ny tabell behövs:
--  endpoint='/odds' eller '/odds/live', fixture_id satt, response=JSONB.)
```

Implicit fält-täckning mot vad som efterfrågades: `fixture` (FK), `timestamp` (`captured_at`), `bookmaker` (id+namn), `market/bet` (id+namn), `value`, `odd`, `handicap`, `main`, `suspended` — allt täckt. `game_state` på live-tabellen är en HÄRLEDD sträng vid infångningstillfället (från `fixture.home_score`/`away_score` vid den tidpunkten), inte ett eget API-fält.

### 4–5. Långsiktig användning — de 13 analysfunktionerna, bedömda

Ingen av dessa byggs nu. Bedömning enligt samma 🟢/🟡/🔴-skala, med motivering — flera kan delvis byggas UTAN odds alls, vilket är värt att notera separat.

| Funktion | Status | Motivering |
|---|---|---|
| **EXPECTATION VS REALITY** | 🟡 | Kräver att vi BÖRJAT samla pre-match-odds — inget historiskt underlag finns. Från dag ett framåt, byggbar. |
| **EXPECTATION GAP** | 🟡 | Samma som ovan — en beräkning ovanpå insamlad data, inget nytt datakrav utöver punkten ovan. |
| **MARKET REACTION** | 🟡 | Kräver `fixture_live_odds_snapshots` kopplat mot `event.minute` — mekaniskt möjligt, men Allsvenskan-specifik live-täckning är overifierad (se punkt 8/10 ovan). |
| **EVENT IMPACT** | 🟡 | Samma datakrav som Market Reaction, bara en snävare fråga (en specifik händelses effekt). |
| **SHOCK INDEX** | 🟡 | Kräver ett pre-match-startvärde (odds) + facit — byggbar framåt, inte historiskt. |
| **MARKET DNA** | 🔴 → 🟡 över tid | Kräver MÅNGA matcher per lag i olika roller (favorit/underdog) — realistiskt först efter en säsongs kontinuerlig insamling, inte ett kortsiktigt mål. |
| **FIRST GOAL EFFECT** | 🟢 delvis NU | Prestationsförändringen efter 1–0 är byggbar REDAN med events+resultat vi redan har — ingen odds behövs för den delen. Marknadens omvärdering av vinstsannolikhet kräver dock framtida live-odds. |
| **GAME STATE + MARKET** | 🟡 | Game state (leder/ligger under) har vi redan; marknadsdelen kräver framtida odds. |
| **COMEBACK PROFILE** | 🟢 delvis NU | "Hur ofta vänder laget ett underläge" är rent resultat-baserat, byggbart idag utan odds. Att koppla det till HUR LÅG marknaden bedömde chansen kräver framtida data. |
| **MARKET CALIBRATION** | 🔴 | Kräver ett stort, statistiskt meningsfullt sample ("när marknaden säger 70 %, hur ofta vinner laget") — år av insamling, inte en nästa-kvartal-funktion. |
| **FALSE RESULT** | 🟢 delvis NU | En xG-baserad variant ("2–0 men xG var jämnt") är byggbar REDAN med lagnivå-xG från steg 4 — ingen odds behövs. En oddsbaserad variant ("resultatet motsade marknadens bild") kräver framtida data. |
| **EVENT → REACTION → CONSEQUENCE** | 🟡 | Kräver framtida `fixture_live_odds_snapshots` kopplat till events — hela kedjan hänger på att vi börjar samla live-odds. |
| **SIMILAR MATCHES** | 🔴 → 🟡 över tid | Kräver ett stort underlag av matcher med jämförbara odds+xG+game state-profiler — mångårig insamling, inte kortsiktigt. |

**Sammanfattning:** tre av tretton (First Goal Effect, Comeback Profile, False Result) har en meningsfull, oddsoberoende variant byggbar REDAN med data vi har idag — värt att prioritera separat från odds-beroendet. Resten kräver att vi faktiskt börjar samla in `fixture_odds`/`fixture_live_odds_snapshots` framåt i tiden; ingenting kan byggas retroaktivt för 2016–2026 eftersom historiska odds inte existerar i källan.

### 6. Kausalitetsregel

Bekräftad och ska efterlevas rakt av i all framtida textgenerering: "vinstsannolikheten ökade med X procentenheter efter bytet" — aldrig "bytet orsakade förändringen" utan en faktisk statistisk analys som stödjer det. "Sammanföll med", inte påstådd orsak.

### 7. Kommersiell användning

**Fan/premium:** var matchen väntad, största överraskningarna, vilka lag överpresterar sina förväntningar, hur förändrades matchen, vilka händelser hade störst impact. Allt kräver framtida odds-insamling utom "vilka händelser hade störst impact" (byggbar nu via events+resultat).

**Klubb/scouting:** motståndares prestation relativt förväntan, reaktion efter insläppt mål, kollaps-mönster efter röda kort, hantering av favorit-matcher, över-/underprestation av matchbild. Flera av dessa (reaktion efter mål, kollaps efter rött kort) är delvis byggbara NU utan odds, rent på events+resultat — odds lägger till "var det oväntat", inte grundanalysen.

### 8. Sammanfattning

**INVENTERING → VERIFIERING → DATAMODELL → ANALYSMÖJLIGHETER → BACKLOGG** — klart, i den ordningen, inget implementerat. Nästa beslut, när det blir aktuellt: ska `fixture_odds`-insamling (pre-match, per omgång) byggas in i steg 5:s pre-match-pipeline direkt (billigt att lägga till nu, väntar annars bara data), eller vänta tills analysmotorn (steg 8–9) faktiskt ska konsumera den? Rekommendation: samla in från och med steg 5 — datainsamling kostar nästan inget och kan aldrig göras retroaktivt, men ANALYSEN på den kan vänta.
