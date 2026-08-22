# Analysis Engine

Hur rådata (CANONICAL-lagret, se [DATABASE.md](DATABASE.md)) förvandlas till
något en användare kan läsa. Det här dokumentet är översikten; djupdyk finns
i [PLAYER_DNA.md](PLAYER_DNA.md) (den enda färdiga "riktiga" analysmotorn)
och [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md) (lag-/matchvyerna, som
är enklare beräkningar, inte en DNA-motor).

```
RAW DATA (fixture, statistics, fixture_player_stats, fixture_team_stats, ...)
   ↓
NORMALISERING  (per90, positionsgruppering — lib/football/position-group.ts)
   ↓
BERÄKNINGAR    (percentiler mot en peer-pool — lib/football/player-dna.ts,
                formrecord/H2H — lib/football/tools.ts)
   ↓
ANALYS         (kategori-score, konfidensnivå, spelartyp)
   ↓
INSIKT         (regelbaserad text: styrkor/svagheter/"aha"-mönster)
```

Det här flödet körs **on-demand**, inte förberäknat — se
[ARCHITECTURE.md](ARCHITECTURE.md#var-beräkning-sker). Ingen separat
DERIVED-tabell lagrar mellanresultat; varje sidladdning/tool-anrop räknar om
från `statistics`/`fixture`-raderna.

## Vad är faktiskt byggt av det ursprungliga fyrlagerkonceptet?

Se [ARCHITECTURE.md](ARCHITECTURE.md#lagren-som-i-allsvenskan-datalager-planen)
för statustabellen. Kort: CANONICAL är byggt, PRODUCT är bara **Player DNA**
— inte "Team DNA" eller "Match DNA" som orden i planeringskommentaren
antyder. DERIVED som ett eget, lagrat mellansteg finns inte; de enklaste
"derived"-beräkningarna (formkurva, H2H-rekord) görs inline i tool-lagret.

## Gemensam infrastruktur: peer-jämförelse (`lib/football/position-group.ts`)

Den viktigaste delade byggstenen, använd av BÅDE Player DNA och den vanliga
spelarprofilens statistikpaneler:

- **Positionsgruppering:** en spelares mått jämförs bara mot andra spelare
  på SAMMA position (anfallare/mittfältare/försvarare — Attacker+Forward
  slås ihop; målvakter hålls helt separat). Detta är resultatet av en riktig
  fixad bugg: en anfallare (A. Ahmed Fatah, 2022) såg ut som "bättre än
  snittet på försvar" när peer-poolen blandade in målvakter (~0
  tacklingar/90) — se `position-group.ts`s egen kommentar för det fulla
  fallet.
- **Minutgolv:** peers filtreras till `minutes_played >= 450` (~5 matcher)
  för att undvika att en enskild 24-minuters insats blir en missvisande
  extrempunkt. Om färre än 4 spelare klarar golvet (vanligt för målvakter i
  en IFK/AIK-bara-pool) faller urvalet tillbaka till alla peers på
  positionen — men flaggas då `isLowSample: true`, aldrig tyst.
- **`PeerGroupSummary`** returneras alltid tillsammans med jämförelsen och
  visas explicit i UI:t (`peerGroup.label`, `.count`, `.minMinutesApplied`,
  `.isLowSample`) — aldrig en tyst, ospecificerad "ligasnitt"-etikett.

**Viktig skillnad mellan de två konsumenterna av denna infrastruktur:**

| | `getPlayerProfile` (vanlig statistikpanel) | `computePlayerDNA` |
|---|---|---|
| Peer-pool spänner | EN säsong | ALLA importerade säsonger poolade ihop |
| Varför | Säsongsvis benchmarking är den etablerade, äldre modellen — lämnades avsiktligt orörd | IFK/AIK-bara-poolen är för liten per position och säsong (13–28 spelare); poolning ger 3–4x underlag |

Det här är en medveten arkitektonisk skillnad, inte en inkonsekvens att
rätta till — se kommentaren överst i `player-dna.ts`.

## Regelbaserat, aldrig ML/AI-genererat

Hela analysmotorn (Player DNA, insikter, spelartyp) är deterministisk
regellogik i TypeScript — trösklar, percentiler, if-satser. Ingen
maskininlärning, ingen klustring (peer-poolen är för liten för det, se
`player-dna.ts`s kommentar), och AI (Claude) används INTE för att generera
eller omformulera analysresultat — bara i chatten, för att välja verktyg och
formulera svenska meningar runt siffror verktyget redan räknat fram. Samma
princip gäller den planerade Insight Engine (se
`INSIGHT_ENGINE_BACKLOG.md`): "AI-lagret formulerar bara om en redan
färdig, verifierad slutsats till text, hittar aldrig på en egen."

## Konfidensmodell (delad princip, konkret implementation i Player DNA)

Två-dimensionell: spelarens EGEN speltid OCH peer-poolens storlek räknas var
för sig till en nivå (hög/medel/låg), och det SVAGASTE av de två avgör den
slutgiltiga konfidensen. Text-genererande delar (sammanfattning, insikter,
spelartyp) genereras ALDRIG på låg konfidens — se
[PLAYER_DNA.md](PLAYER_DNA.md#konfidensmodell) för exakta trösklar.

## Vad är INTE byggt än (den riktiga skillnaden mot planen)

- 🔴 Team DNA — ingen kod, bara ordet i en migrationskommentar och
  `INSIGHT_ENGINE_BACKLOG.md`. Det som finns istället är `getTeamComparison`/
  `getTeamProfile` — resultatbaserade jämförelser, ingen percentil-/DNA-modell.
  Se [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md).
- 🔴 Match DNA / momentum-analys — kräver `fixture_live_snapshots`, som är
  tom (se [DATABASE.md](DATABASE.md#tomma-tabeller)).
- 🔴 Insight Engine (50 analysdimensioner, VARFÖR/NÄR/TREND/etc.) —
  uttryckligen ej påbörjad, se `INSIGHT_ENGINE_BACKLOG.md`s egen statusrad.
  Backloggen är skriven för att appliceras EFTER hela datalagerprojektet
  ("10-stegsplanen") är klart.
- 🔴 "Development over time" / trendanalys över flera säsonger för Player
  DNA — nämnt som en smal, avgränsad framtida funktion i produktplanens
  P1/P2-lista (bara 14 av 119 spelare, ~12 %, har data i alla tre
  committade säsonger).
- 🔴 Similar Players / sub-positionsklustring — explicit scopat ut ur
  Player DNA-bygget.
