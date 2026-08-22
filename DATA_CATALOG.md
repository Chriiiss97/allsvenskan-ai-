# Data Catalog

Vilken data projektet faktiskt har — och lika viktigt, vad det inte har.
Se [DATABASE.md](DATABASE.md) för tabellstruktur/relationer och
[API.md](API.md) för endpoint-detaljer. Statusnivåer förklaras i
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md).

## Täckning — lag, säsonger, tävling

```
Källa:      API-Football v3, /leagues, /teams, /players, /fixtures m.fl.
Liga:       Allsvenskan (external_id 113) — ENDA importerade ligan
Tävling:    Bara Allsvenskan-serien. Ingen cup/Europa-data importerad
            (schemat stödjer det via league_id, men bara en league-rad finns)
```

| Vad | Committat (senaste `git commit`) | Okommitterat (arbetsträd, pågående) |
|---|---|---|
| Säsonger | 2022, 2023, 2024 | 2016–2025 samt delar av 2026 (2026 innehåller alltid NS-matcher som ej spelats än) |
| Lag i datalagret | 23 (unionen av lag som förekommit i ligan 2022–2024) | 32 (unionen 2016–2026, inkl. relegerade/kvalade lag som Örebro, Östers IF, Trelleborg, m.fl.) |
| Status | 🟢 Importerat och verifierat (726 matcher, commit `c6dffed`) | 🟡 Kod ändrad, en delkörning påbörjad (`scripts/player-stats-output.txt`, avbruten mitt i) — **oklart om fullständigt körd**, verifiera mot databasen innan den räknas som klar |

**Produktbredd ≠ datalagerbredd:** oavsett hur många lag som finns i
databasen pratar chatboten, Player DNA och lag-vs-lag-jämförelsen bara om
**IFK Göteborg och AIK** (hårdkodat, se [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#två-olika-bredder-i-samma-databas--viktigt-att-förstå)).

## Per datamängd

### Grundläggande matchdata (resultat, tabellplacering)

```
Källa: API-Football /fixtures, /standings
Nivå: Match / lag
Tabell: fixture, standings
Status: 🟢 (fixture) / 🟢 men bara en snapshot per körning (standings)
```
`standings` är append-only konstruerat för att kunna visa "tabellposition
över tid", men eftersom historiska säsonger bara importeras en gång blir
det i praktiken en enda slutgiltig-tabell-snapshot per säsong, inte en
verklig tidsserie ännu.

### Matchhändelser (mål/kort/byten)

```
Källa: API-Football /fixtures/events
Nivå: Match, minutupplöst
Tabell: event
Status: 🟢 men med en KÄND, verifierad datalucka
```
Kort och byten är rikt täckta. **Mål är systematiskt underrapporterade** i
API-Football:s historiska data för äldre matcher — bekräftat i kod
(`getMatchReport`s `eventsComplete`-flagga räknar om mål-events summerar
till det verkliga resultatet). Detta är en äkta källucka, inte en
importbugg — importet sparar exakt vad API:t returnerar. UI:t visar en
explicit varning ("ofullständig händelsedata") istället för att låtsas
tidslinjen är komplett. Vid dokumentationstillfället (commit `c6dffed`,
committad omfattning) hade 24 av 174 matcher (IFK/AIK-scopet) fortfarande
ingen synkad händelsedata alls.

### Säsongsaggregerad spelarstatistik

```
Källa: API-Football /players (mål, assist, kort, skott, passningar,
       tacklingar, dueller, dribblingar, fouls — se lib/api-football/types.ts)
Nivå: Spelare / lag / säsong / tävling
Tabell: statistics
Status: 🟢 för volymmått, 🔴/🟡 för passningssäkerhet
```
**Viktig kvalitetsanmärkning, bekräftad i kod:** `passes_accuracy` är bara
ifyllt för **10–17 %** av spelarna — för glest för att kunna benchmarkas.
Det är därför Player DNA:s "Bollinvolvering"-kategori medvetet bara mäter
passningsVOLYM, inte passningssäkerhet, och är namngiven därefter istället
för att låtsas mäta passningskvalitet (se
[PLAYER_DNA.md](PLAYER_DNA.md#bollinvolvering-inte-passningsspel)).
`dribbles.past` (antal gånger spelaren dribblats förbi) importeras inte
alls — API:t har fältet, vårt typlager (`lib/api-football/types.ts`) hämtar
det inte i `statistics`-flödet (däremot i `fixture_player_stats`, se
nedan — inkonsekvent mellan de två statistiklagren).

**"Aktiv spelare"-definition (låst regel, se `lib/football/active-player.ts`):**
API-Football:s `statistics`-rader inkluderar ALLA som var registrerade för
en klubb en säsong (provspelare, reserver) — inte bara de som faktiskt
spelade. En spelare räknas som aktiv en säsong bara om `appearances > 0`.
Denna regel tillämpas konsekvent i spelarlistan, säsongsväljare och
truppvyer — utom i adminpanelens råa "Datatäckning"-siffra (avsiktligt
teknisk räkning) och spelarsöket i "Jämför spelare" (fritextsök, inte en
antalsstatistik).

### Per-match spelarstatistik (skiljer sig från säsongsaggregerat ovan)

```
Källa: API-Football /fixtures/players
Nivå: Spelare / match
Tabell: fixture_player_stats
Status: 🟢 importerad, 🔴 ännu inte använd av någon analys/UI
```
Rikare än `statistics`: inkluderar `is_captain`, `is_substitute`,
målvaktsspecifika fält (`goals_conceded`, `saves`), full straffstatistik
(`penalty_won/committed/scored/missed/saved`), och `dribbles_past`. Detta är
den avsedda grunden för framtida form-/konsistensanalys (steg 8–9 i planen)
men **ingen kod läser från den tabellen ännu** utanför import-scriptet
själv — varken tool-lagret, Player DNA eller UI:t använder den idag.

### Per-match lagstatistik

```
Källa: API-Football /fixtures/statistics
Nivå: Lag / match
Tabell: fixture_team_stats
Status: 🟢 importerad, 🔴 ännu inte använd av någon analys/UI
```
Skott (på/utanför/blockerade/i-/utanför straffområdet), bollinnehav,
hörnor, fouls, passningar+säkerhet, kort, målvaktsräddningar — plus:

#### Expected Goals (xG)

```
Källa: API-Football /fixtures/statistics (fälten "expected_goals"/"goals_prevented")
Nivå: LAG / match (inte spelare)
Tabell: fixture_team_stats.expected_goals / .goals_prevented
Status: 🟢 rådata finns, importerad. 🔴 spelarnivå-xG finns inte i API:t
```
Ett äkta, oväntat fynd (dokumenterat i migrationskommentaren): API-Football
ger ett riktigt `expected_goals`-fält per lag och match, plus
`goals_prevented` för målvaktsprestanda. Det här ändrade flera tidiga
"omöjligt att bygga xG"-bedömningar till "redan tillgänglig rådata" — men
bara på lagnivå. Ingen kod visar detta i UI:t ännu.

### Laguppställningar

```
Källa: API-Football /fixtures/lineups
Nivå: Match (formation, startelva, avbytare, tränare)
Tabeller: fixture_lineup, fixture_lineup_player
Status: 🟢 importerad, 🔴 ännu inte använd av någon analys/UI
```
Inkluderar `grid` (rad:kolumn i formationen) — en verklig
sub-positionsindikator, men **ingen** spatial koordinatdata (se nästa
avsnitt).

### Spatial data / skottkartor

```
Status: 🔴 EJ MÖJLIGT med API-Football
```
Bekräftat genom faktiska testanrop (dokumenterat i migrationskommentaren):
`/fixtures/events` innehåller INGA x/y-koordinater eller skotttyp. En
skottkarta ("shot map") kan alltså inte byggas med den här datakällan,
punkt slut — inget att gissa sig runt.

### Halvleks-/momentum-data under en match

```
Status (API-Football): 🔴 EJ MÖJLIGT retroaktivt, 🟡 möjligt FRAMÅT i tiden (kräver live-poller, ej byggd)
Status (Sportmonks, Fas 6, 2026-08-21): 🟢 LÖST — retroaktivt OCH framåt, 2024+
```
`/fixtures/statistics` är en tidsstämpellös ögonblicksbild — API-Football
sparar ingen egen historik, och redan spelade matcher kan ALDRIG få en
retroaktiv matchkurva den vägen. `fixture_live_snapshots`-tabellen finns
kvar för framtida API-Football-live-fångst (fortfarande ingen poller byggd),
men begränsningen är **inte längre permanent** i praktiken: Sportmonks
Pressure Index (`fixture_pressure_index`, Fas 6) ger minutupplöst
matchmomentum — retroaktivt för REDAN SPELADE matcher, bekräftat i skarp
drift för alla 615 mappade matcher 2024–2026 (115 268 rader, grain
`(fixture_id, team_id, minute)` verifierat unikt). Begränsningen kvarstår
bara för 2016–2023 (utanför Sportmonks täckning).

### Skador

```
Källa: API-Football /injuries (matchbunden status) + /sidelined (datumintervall)
Nivå: Spelare
Tabell: player_injury (kind: 'matchstatus' | 'sidelined')
Status: 🟡 Schema finns, INGEN import-kod skriver hit
```
Två olika, bekräftat separata endpoints (inte samma data i två format).
Ingen `import-injuries.ts` existerar — se [ROADMAP.md](ROADMAP.md).

### Tränare

```
Källa: API-Football /coachs
Nivå: Lag (karriärhistorik)
Tabell: coach + fixture_lineup.coach_id
Status: 🟢 importerad — med en känd datakvalitetsvarning
```
API:t returnerade i verifieringstestet två separata poster (olika
`external_id`) för vad som ser ut att vara SAMMA verkliga tränare (en rik
post, en nästan tom). Ingen databas-constraint löser detta — importet
sparar båda raderna rakt av. En framtida "samma person"-sammanslagning är
en öppen, inte byggd, analysfråga.

### Domare

```
Källa: fixture.referee (bara en namnsträng, ingen egen /referees-endpoint)
Tabell: referee (matchning på exakt namnsträng)
Status: 🟢 importerad, känd svaghet: ingen dedupe mot stavningsvarianter
```

### Arenor

```
Källa: API-Football /teams (venue-objektet är inbäddat, ingen separat runda behövs)
Tabell: venue
Status: 🟢 importerad (namn, adress, stad, kapacitet, underlag, bild)
```

### Klubbfakta (smeknamn, historia, troféer, legendarer, rivaliteter)

```
Källa: MANUELLT insamlad från klubbarnas officiella hemsidor + Wikipedia
       (INTE API-Football)
Nivå: Lag
Tabeller: team.nicknames/short_history/website_url, team_trophy, team_legend,
          team_rivalry
Status: 🟢 för IFK Göteborg + AIK. 🔴 för övriga ~30 lag i datalagret
```
Strukturerat i egna fält (inte fritext), enligt principen i
`PROJEKT_BRIEF (1).md` — se `scripts/import/team-facts-data.ts`. Kostar
inga API-anrop. Skrivs via `seed-team-facts.ts` (delete+insert per lag,
säkert att köra om). Bara de två produktlagen har fakta ifyllda.

### Liganivåfakta

```
Källa: Manuellt (samma princip som klubbfakta)
Tabell: league.founded_year/short_history, league_fact
Status: 🟢
```

### Odds

```
Status: 🔴 Inte importerat. Bekräftat TILLGÄNGLIGT hos API-Football
        (nämnt i PROJEKT_BRIEF.md:s endpoint-lista) men aldrig hämtat —
        inget kodstöd, ingen tabell.
```

### Transfers, trophies (klubbnivå från API:t, inte manuellt), "sidelined" utöver skador

```
Status: 🔴 Nämnda som möjliga bonus-endpoints i PROJEKT_BRIEF.md, aldrig byggda.
```

## Sammanfattning: vad kan vi INTE bygga med nuvarande data (oavsett hur mycket UI-arbete som läggs)

- Skottkartor / spatial analys (API-begränsning, permanent — även Sportmonks saknar x/y-koordinater i vår plan)
- Spelarnivå-xG **för 2016–2023** (API-Football ger bara lagnivå; Sportmonks har spelarnivå-xG men bara 2024+, se Fas 5)
- Retroaktiv matchmomentum/halvlekskurva **för 2016–2023** (API-Football-begränsningen är permanent för de säsongerna; för 2024+ är den LÖST via Sportmonks Pressure Index, Fas 6 — se ovan)
- Passningskvalitet som benchmark-mått **i `statistics`-tabellen/2016–2023** (data finns för <20 % av spelarna där; Sportmonks `passes_accuracy_pct` är konsekvent befolkad för 2024+, se Fas 5)
- Publikdata (aldrig undersökt om API:t har det)
- Odds-analys (data finns hos API:t, 0 rader importerade)
- Allt som kräver cup-/Europaspel (bara Allsvenskan-serien importerad)
