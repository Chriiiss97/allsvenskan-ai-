# Team & Match Analysis

**Namnvarning, läs detta först:** den ursprungliga planeringen (se
migrationskommentaren i `20260820120000_match_depth_schema.sql` och
`INSIGHT_ENGINE_BACKLOG.md`) talar om "Team DNA" och "Match DNA" som
kommande motparter till Player DNA. **Ingen av dem är byggd.** Det som
faktiskt finns är enklare, resultat-/händelsebaserade vyer utan
percentil-/peer-modell. Det här dokumentet beskriver VAD SOM FINNS —
använd inte namnen "Team DNA"/"Match DNA" om det, det är missvisande. Se
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md#regeln-för-planerade-funktioner).

## Lagprofil — `getTeamProfile` (`lib/football/tools.ts`)

```
Status: 🟢 byggd, UI-lager ENDAST (app/(app)/data/teams) — inget Claude-verktyg
Scope: bara IFK Göteborg + AIK (COMPARABLE_TEAM_EXTERNAL_IDS)
```

Vad den returnerar: säsongsrekord (`computeFormRecord` — W/D/L, mål för/emot,
poäng, senaste 5 resultat), trupp (spelare med `appearances > 0` den
säsongen — se [DATA_CATALOG.md](DATA_CATALOG.md)s "aktiv spelare"-regel),
toppmålskytt/toppassistgivare, senaste 5 matcher, klubbfakta
(`getTeamFacts`). Ingen percentil, ingen jämförelse mot ligan i stort — rena
egna säsongstal.

## Lag-vs-lag — `getTeamComparison`

```
Status: 🟢 byggd, används av BÅDE UI (app/(app)/data/teams/compare) och som
        underliggande hjälpfunktion (delar computeFormRecord med getTeamProfile)
Scope: samma begränsning — bara IFK Göteborg + AIK
```

Ger sida-vid-sida-formrekord + inbördes möten (H2H, alla historiska möten
mellan de två, inte bara aktuell säsong) med ett riktigt vinst/oavgjort/
förlust-facit. Inga percentiler mot resten av ligan — en ren
resultatjämförelse, inte en "DNA"-profil.

Team-vs-team är HÅRT gated: `getTeamComparison`/`getTeamProfile` kastar ett
tydligt fel ("har inte fullständig matchhistorik importerad") om något av
lagen inte finns i `COMPARABLE_TEAM_EXTERNAL_IDS` — även om båda lagen
faktiskt finns i det bredare datalagret. Det är den konkreta koden bakom
"produktbredd ≠ datalagerbredd"-principen i
[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Matchrapport — `getMatchReport` / `getMatchReportForTeams`

```
Status: 🟢 byggd, används av UI (app/(app)/data/matches/[fixtureId]) OCH
        chatten (get_match_report-verktyget)
```

Returnerar resultat, händelsetidslinje (mål/kort/byten, minutordnad),
**explicit `eventsComplete`-flagga** — se
[DATA_CATALOG.md](DATA_CATALOG.md#matchhändelser) för varför mål ibland
saknas i källdatan; UI:t visar en ärlig disclaimer istället för att låtsas
tidslinjen är fullständig. `fullPlayerDetail`-flaggan markerar om båda lagen
är i `COMPARABLE_TEAM_EXTERNAL_IDS` (rikare framtida detaljvy möjlig) — inte
kopplad till någon extra data idag, bara en markör.

Självmål hanteras korrekt: krediteras det MOTSTÅNDANDE laget när
`eventsComplete` räknas ut (`detail === "Own Goal"` inverterar vilket lag
som får målet).

`getMatchReportForTeams` (chattverktyget) löser lag(+ev. motståndare
+säsong) till den senaste avslutade matchen — samma matchup-SQL-filter som
`getFixtures` (medvetet inte ett JS-filter efter `.limit()`, se historisk
bugg nedan).

## Historisk bugg värd att känna till (fixad, men lärorik för framtida filter)

`getFixtures`/`getMatchReportForTeams`s motståndarfilter MÅSTE vara en del
av SQL-villkoret (`.or(...)`), inte ett filter i JS efter `.limit()` —
annars kapar `.limit()` bort de relevanta matcherna INNAN JS-filtret ens
tittat på dem. Konkret symptom när detta var trasigt: "senaste derbyt" med
`limit=1` gav lagets absolut senaste match oavsett motståndare, filtrerades
sedan bort i JS, och gav ett tomt resultat trots att äldre möten fanns i
databasen. Se [[verify-tool-bugs-via-live-path]] — den här klassen av bugg
syns bara genom den riktiga route+DB-vägen, inte en isolerad enhetstest av
filtreringslogiken.

## Vad som INTE finns (trots namnen i planen)

- 🔴 Ingen percentil-/peer-baserad lagprofil (motsvarigheten till Player
  DNA:s kategorier/konfidens/insikter för lag).
- 🔴 Ingen momentum-/matchkurva-analys (kräver `fixture_live_snapshots`,
  tom — se [DATABASE.md](DATABASE.md#tomma-tabeller)).
- 🔴 Ingen användning av `fixture_team_stats` (xG, bollinnehav, skott) eller
  `fixture_player_stats` i någon lag-/matchanalys ännu — importerad men
  oanvänd rådata, se [DATA_CATALOG.md](DATA_CATALOG.md).
- 🔴 Lag-vs-lag och lagprofil fungerar bara för IFK Göteborg/AIK — att
  bredda till fler lag kräver att ändra `COMPARABLE_TEAM_EXTERNAL_IDS`,
  INTE mer data (datan finns redan för fler lag, se
  [INGESTION.md](INGESTION.md)).
