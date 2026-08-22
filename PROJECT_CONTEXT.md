# Project Context — Allsvenskan-chattbot (Allsvenskan AI)

Start här. Det här dokumentet är navet — resten av dokumentationen länkas
härifrån istället för att upprepas.

**Läsordning för en ny AI-agent eller utvecklare:**

```
PROJECT_CONTEXT.md  (du är här)
        ↓
SOURCE_OF_TRUTH.md   — hur man avgör vad som är sant om projektet
        ↓
ARCHITECTURE.md      — hur systemet faktiskt hänger ihop
        ↓
DATABASE.md + DATA_CATALOG.md  — vad databasen innehåller och inte
        ↓
INGESTION.md         — hur data kommer in
        ↓
ANALYSIS_ENGINE.md → PLAYER_DNA.md / TEAM_MATCH_ANALYSIS.md  — vad vi räknar ut
        ↓
API.md               — API-Football-integrationen och dess begränsningar
        ↓
ROADMAP.md            — status: klart / pågående / planerat / omöjligt just nu
        ↓
DEVELOPMENT_GUIDE.md   — regler innan du ändrar något
```

## Vad är det här?

Allsvenskan-chattbot (arbetsnamn, mappen heter `Allsvenskan ai`) är ett
svenskspråkigt hobbyprojekt: en webbapp där man kan chatta med
Allsvenskan-fotbollsstatistik ungefär som man chattar med Claude/ChatGPT,
men smalt fokuserad på fotboll — plus en växande "Data"-sektion med
spelarprofiler, lagjämförelser, matchrapporter och en regelbaserad
analysmotor (Player DNA). Byggare/ägare: en enda hobbyist
(ci.carlsson97@gmail.com) som "vibe-codar" med Claude Code, ingen tidigare
erfarenhet av stora projekt. Ingen extern remote/deploy ännu — allt körs
lokalt (`npm run dev`), ingen `git remote` konfigurerad.

Fullständig ursprunglig planering (mål, budget, MVP-beslut, säkerhetsprinciper)
finns kvar i [`PROJEKT_BRIEF (1).md`](<PROJEKT_BRIEF (1).md>) — läs den för
**varför**-resonemang bakom tidiga beslut, men lita på den här
dokumentationen + koden för **vad som faktiskt finns idag** (se
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)). Brevet är från projektstart;
mycket av "planerat" i det dokumentet är sedan byggt.

## Syfte

Ett smalt, verifierbart alternativ till att fråga ett generellt AI-verktyg
om fotbollsstatistik: chatboten gissar aldrig siffror, den anropar alltid
ett verktyg som läser från en egen databas byggd på riktig data från
API-Football. Samma "gissa aldrig, hitta aldrig på"-princip gäller hela
projektet, inklusive den nyare analysdelen (Player DNA) — se
[SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) och de återkommande "aldrig
fabricera data"-kraven i kodkommentarerna.

## Huvudarkitekturen (kort — se [ARCHITECTURE.md](ARCHITECTURE.md) för detaljer)

```
API-Football  →  Import-script (scripts/import/)  →  Supabase (Postgres)
                                                          ↓
                                    lib/football/tools.ts (delad affärslogik)
                                          ↓                        ↓
                          app/api/** (REST, manuell testning)   app/(app)/data/** (server components, direktanrop)
                                          ↓
                          lib/football/tool-dispatch.ts + tool-definitions.ts
                                          ↓
                                   app/api/chat/route.ts  →  Claude (tool-calling)  →  chat-UI
```

## Två olika "bredder" i samma databas — viktigt att förstå

Det här är den enskilt viktigaste nyansen i hela projektet just nu:

- **Datalagret** (`team`, `fixture`, `statistics`, m.fl.) importeras numera
  för **hela Allsvenskan** (23–32 lag beroende på hur man räknar, se
  [INGESTION.md](INGESTION.md)) över flera säsonger (2022–2024 committat,
  utökning till 2016–2026 pågår okommitterat).
- **Produkten** (chatboten, Player DNA, lag-vs-lag-jämförelse) är
  fortfarande **medvetet hårdkodad till bara IFK Göteborg och AIK**
  (`lib/football/tool-definitions.ts`s `enum: ["IFK Göteborg", "AIK"]`,
  `COMPARABLE_TEAM_EXTERNAL_IDS` i `lib/football/tools.ts`). Detta är ett
  aktivt vald begränsning, inte en bugg — se minnesanteckning i
  [ROADMAP.md](ROADMAP.md).

Med andra ord: databasen vet om alla lag, men produkten pratar bara om två
av dem. Bygg aldrig en funktion som antar att "fler lag i databasen" =
"fler lag i produkten" utan att uttryckligen bredda produktlagret också.

## Vad är färdigt (mycket kort — se [ROADMAP.md](ROADMAP.md) för fullständig lista)

🟢 Auth (Google OAuth via Supabase, roller user/admin), grundschema,
historisk dataimport (lag/spelare/matcher/händelser för IFK+AIK), tool-lager
+ chat-endpoint med Claude-tool-calling, chat-UI, gratiskvot, en Data-sektion
(spelarprofiler, spelarjämförelse, lagprofil, lag-vs-lag, matchrapporter),
Player DNA (regelbaserad analysmotor), adminpanel (analys, obesvarade
frågor, feature flags), ett bredare datalager (23+ lag, matchdjup: lineups/
team-stats/player-stats/events för alla matcher).

🟡 Utökning av datalagret till 2016–2026 (okommitterat, pågående).
Admin-analytics-migrationen kan vara okörd i den riktiga databasen (kräver
manuell verifiering). Insight Engine, Team DNA, Match DNA — bara planerade.

🔴 Live-matcher/live-chatt, "Tabeller"-sidan (nav-länk finns, avsiktligt
inaktiverad), betalning/prenumeration, riktig produktionsdeploy.

## Standing constraints (gäller all vidareutveckling)

- Hitta aldrig på data — allt konkret kommer från databasen, aldrig från
  modellens minne.
- Saknad data döljs helt i UI, visas aldrig som en tom platshållare.
- Allt UI-/systemprompt-text är svensk, samlad i `lib/i18n/sv.ts`.
- Appen är permanent mörk-temad (inte `prefers-color-scheme`-kopplad) —
  utom `/login`, `/onboarding`, `/auth/callback`, `/stats`, som ligger
  utanför `app/(app)/`-layouten och fortfarande använder Tailwinds
  `dark:`-varianter (en känd, oåtgärdad inkonsekvens, se
  [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md#kända-inkonsekvenser)).
- Live-funktioner och tabellvyn är medvetet uppskjutna.

## Dokumentkarta

| Dokument | Vad det svarar på |
|---|---|
| [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) | Vilken källa väger tyngst när dokument/kod/plan säger olika saker |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Hur systemet faktiskt är uppbyggt, lager för lager |
| [DATABASE.md](DATABASE.md) | Tabeller, relationer, RLS, vilka som faktiskt används |
| [DATA_CATALOG.md](DATA_CATALOG.md) | Vilken data vi har OCH inte har, per ämne |
| [INGESTION.md](INGESTION.md) | Hur data kommer från API-Football till Supabase |
| [ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md) | Det fyrlagriga analyskonceptet (RAW→CANONICAL→DERIVED→PRODUCT) och vad som faktiskt är byggt av det |
| [PLAYER_DNA.md](PLAYER_DNA.md) | Den enda färdiga "PRODUCT"-analysmotorn — hur den räknar |
| [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md) | Lag- och matchvyerna som finns idag (inte "Team/Match DNA" — det är planerat) |
| [API.md](API.md) | API-Football-endpoints som används, och vad API:t INTE ger |
| [ROADMAP.md](ROADMAP.md) | Klart / pågående / nästa / planerat / omöjligt just nu |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | Regler för att bygga vidare utan att förstöra det som finns |
| [`INSIGHT_ENGINE_BACKLOG.md`](INSIGHT_ENGINE_BACKLOG.md) | (Befintlig fil, orörd) 50 analysdimensioner, backlog för efter datalagerprojektet |
| [`PROJEKT_BRIEF (1).md`](<PROJEKT_BRIEF (1).md>) | (Befintlig fil, orörd) Ursprunglig planering — historisk, inte statusrapport |
| [`SETUP.md`](SETUP.md) | (Befintlig fil, orörd) Manuell Supabase/Google-uppsättning |
