# Roadmap

Status vid dokumentationstillfället (2026-08-20). Baserat på `git log`,
arbetsträdets faktiska innehåll (inklusive okommitterat), och kodsökning —
inte på `README.md`/`PROJEKT_BRIEF (1).md`, som beskriver ett tidigare
skede (se [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)). Blanda aldrig ihop
kolumnerna — en post i "PLANERAT" är inte "NÄSTAN KLAR", den är obörjad.

## DONE 🟢

- Next.js-projektstruktur (App Router, TypeScript, Tailwind), Supabase Auth
  (Google OAuth) med `role`-fält.
- Grundschema (`league`/`season`/`team`/`player`/`fixture`/`event`/`statistics`)
  + kvalitativ klubbfakta för IFK Göteborg/AIK.
- Historisk import för de två produktlagen (2022–2024, committat).
- Tool-lager (`lib/football/tools.ts`) + REST-endpoints (`app/api/**`).
- Chat-endpoint (`/api/chat`) med Claude tool-calling, gratiskvot
  (3 meddelanden/dag, admin undantaget), konversationshistorik,
  ämnesbegränsning, obesvarade-frågor-loggning.
- Chat-UI (`components/chat/`).
- Favoritlags-personalisering + onboarding.
- Data-sektion: spelarprofil, spelarjämförelse, lagprofil, lag-vs-lag,
  matchrapporter, sidonavigering (`app/(app)/`).
- Adminpanel: analytics (användare/aktivitet/nya-per-dag), "vad frågar
  användarna om" (ämnen + verktygsanvändning), AI-kostnadsspårning,
  feature flags (`chat_enabled` verkligt kopplad), obesvarade frågor-UI,
  per-användare-drilldown.
- Player DNA (regelbaserad analysmotor) — se [PLAYER_DNA.md](PLAYER_DNA.md).
- Ligabrett datalager (steg 1–4 av en 10-stegsplan kallad "Allsvenskan
  Datalager"): 23 lag, matchdjup (lineups/team-stats/player-stats/events)
  för 726 matcher, `venue`/`coach`/`referee`/`standings`-tabeller.

## IN PROGRESS 🟡

- **Utökning av datalagret till 2016–2026, 32 lag** — kod ändrad
  okommitterat, en importkörning påbörjad men avslutas utan bekräftat
  "Klart" (se [INGESTION.md](INGESTION.md#pågående-utökning-2016–2026-okommitterat)).
  Verifiera databasens faktiska innehåll innan detta räknas som klart.
- **Admin-analytics-migrationen** (`20260819220000_admin_analytics.sql`)
  kan vara skriven men okörd i den riktiga Supabase-databasen — appen
  "fail:ar öppet" (visar tomma/ej-tillgängligt-vyer) om så är fallet,
  vilket gör det lätt att missa. Verifiera manuellt.

## NEXT (rimlig fortsättning på redan påbörjat arbete)

- Färdigställ och VERIFIERA 2016–2026-utökningen (committa configändringen,
  kör de matchnära importstegen till slut, bekräfta radantal i databasen).
- Koppla in `api_raw_response`/`ingestion_log`-skrivning i importscripten
  (schema finns, ingen kod — se [DATABASE.md](DATABASE.md#tomma-tabeller)).
- Bygg `import-injuries.ts` (`/injuries` + `/sidelined`, schema finns
  redan i `player_injury`).

## PLANNED (uttalat i planeringsdokument, ingen kod ännu)

- **Visuell statistiksida / bredare rådata-UI** (nämnd i `README.md`):
  matchtabeller/diagram på `fixture_team_stats`/`fixture_player_stats` —
  datan finns redan importerad, oanvänd i UI (se
  [DATA_CATALOG.md](DATA_CATALOG.md)).
- **Insight Engine** — 50 analysdimensioner, se `INSIGHT_ENGINE_BACKLOG.md`.
  Uttryckligen: påbörjas EFTER hela datalagerprojektet, inte nu.
- **Team DNA / Match DNA** — bara namn i en plan, ingen kod. Se
  [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md) för vad som finns
  istället.
- **Bredda produkten bortom IFK/AIK** — datalagret är redan brett (23–32
  lag), produkten (chat/Player DNA/lag-vs-lag) är hårdkodad till två. Att
  bredda kräver kodändringar (enum-listor, `COMPARABLE_TEAM_EXTERNAL_IDS`),
  inte mer data.
- **Live-matchchatt** (fas 3 i ursprungsplanen): poll/diff mot
  `live=all`-endpointen (bekräftat fungerande, se [API.md](API.md)),
  websocket/Supabase Realtime-push. `fixture_live_snapshots`-tabellen finns,
  ingen poller.
- **"Tabeller"-sidan** — nav-länken finns i `Sidebar.tsx`
  (`disabled: true`), medvetet avstängd tills en riktig ligatabell-vy är
  byggd (nu finns rådata i `standings`, bara ingen UI-sida).
- **Betalning/prenumeration** (Stripe nämnd, fas 4 i ursprungsplanen).
- **Google OAuth i produktion** — koden finns, kräver riktiga Google Cloud-
  uppgifter (se `SETUP.md`), `app/dev-login` är den tillfälliga ersättningen.
- **Schemalagd/cron-driven import** — allt är fortfarande manuellt.
- **Produktionsdeploy** (Vercel nämnd, inget kopplat; ingen `git remote`).

## NOT POSSIBLE CURRENTLY (API- eller datakällebegränsning, inte ett prioriteringsval)

Se [DATA_CATALOG.md](DATA_CATALOG.md#sammanfattning-vad-kan-vi-inte-bygga-med-nuvarande-data-oavsett-hur-mycket-ui-arbete-som-läggs)
för fullständig lista: skottkartor/spatial analys, spelarnivå-xG, retroaktiv
matchmomentum för redan spelade matcher, passningssäkerhet som
benchmark-mått (för gles data), cup-/Europaspel-statistik (inte importerad
liga).

## Historik värd att känna till (varför saker ser ut som de gör)

- Sporten var ursprungligen tänkt att vara ishockey (SHL) — bytt till
  fotboll/Allsvenskan pga bättre, öppnare API-tillgång (API-Football).
  Se `PROJEKT_BRIEF (1).md`.
- Flera riktiga databuggar (inloggning kraschade helt, kvot-räknaren hade
  en kolumn-tvetydighet, uppblåsta spelarantal, felaktig peer-jämförelse)
  är redan hittade och fixade genom att testa mot en riktig inloggad
  testanvändare/riktig databas — se [DATABASE.md](DATABASE.md#kända-databuggar-redan-fixade-historik-inte-öppna-problem)
  och [[verify-tool-bugs-via-live-path]].
