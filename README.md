# Allsvenskan-chattbot

Chatta med Allsvenskan-statistik. Se [`PROJEKT_BRIEF (1).md`](<PROJEKT_BRIEF (1).md>) för full projektkontext, beslut och roadmap.

## Status

**Steg 1–6 är klara och verifierade end-to-end:**

1. **Projektstruktur** — Next.js (App Router, TypeScript, Tailwind), Supabase Auth med `role`-fält på användartabellen
2. **Databasschema** — säsongs-/liga-agnostiskt, uppdelat per tävling, se `supabase/migrations/`
3. **API-Football-import** — historisk data (2022–2024) för IFK Göteborg och AIK: lag, spelare, statistik, matcher. Gratisplanen saknar innevarande säsong (2026), se `scripts/import/config.ts`. Matchhändelser (mål/kort-minuter) importeras i omgångar pga API-kvoten — kör `npm run import events` för att fortsätta.
4. **Lagfakta** — smeknamn, historia, troféer, legendarer, rivaliteter (IFK/AIK) + liganivåfakta (Allsvenskan), källor: klubbarnas egna sidor + Wikipedia, se `scripts/import/team-facts-data.ts` / `league-facts-data.ts`
5. **Tool-lagret** — egna API-endpoints (`/api/teams/[team]/...`, `/api/league/facts`) som Claude använder som verktyg
6. **Chat-endpoint** — `/api/chat`: Claude + tool-calling, kvot (3 meddelanden/dag), konversationshistorik, ämnesbegränsning

**Steg 7 (chat-UI)** — pågående.

**Personalisering** — användare väljer favoritlag (IFK/AIK) efter första inloggning, startsidan visar deras klubbs senaste resultat.

**Ej påbörjat:** Google-inlogg är pausad (kräver Google Cloud-uppgifter från kontoägaren) — testat hittills med tillfälliga testkonton (lösenord + admin-API) som skapas och tas bort i samma session.

## Nästa stora spår: visuell statistiksida (USP mot ChatGPT/Gemini)

Idé (inte påbörjad): en riktig statistiksida à la avancerade sportanalys-sajter — datatabeller, matchrapporter, spelarkort, jämförelser, diagram — byggd på råstatistik från API-Football (`/fixtures/statistics`): skott (på mål/utanför/blockerade/i-utanför straffområdet), hörnor, bollinnehav, offsides, fouls, passningar + passningssäkerhet, kort, räddningar. **Inte** avancerade beräknade mått som xG/Corsi — de kräver egna formler/dyrare datakällor, inte något API-Football ger rakt av.

Kostar 1 API-anrop/match (samma "kör i omgångar"-mönster som matchhändelser). Kräver: ny databastabell för matchstatistik, nytt import-steg, och betydligt UI-arbete (diagram, kort, jämförelsevy). Görs efter att chat-UI:t (steg 7) är klart.

## Kom igång

Se [`SETUP.md`](SETUP.md) för hur du skapar Supabase-projektet, kör databasschemat och kopplar in Google-inlogg — det krävs innan appen fungerar (utom /stats, som är publik).

```bash
npm install
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000). Se [http://localhost:3000/stats](http://localhost:3000/stats) för en rå förhandsvisning av importerad data (ingen inloggning krävs).

### Import-scriptet

```bash
npm run import              # allt utom events (~25 API-anrop)
npm run import league        # bara liga/säsonger
npm run import teams         # bara lag
npm run import players       # bara spelare/statistik
npm run import fixtures      # bara matcher
npm run import events        # matchhändelser, 1 anrop/match, kör i omgångar
npm run import facts         # lag- + liganivåfakta, inga API-anrop
```

## Struktur

```
app/
  api/chat/             Chat-endpoint (Claude + tool-calling)
  api/teams/[team]/     Tool-lager: top-scorers, cards, facts, fixtures
  api/league/facts/     Tool-lager: liganivåfakta
  auth/callback/        OAuth-callback för Supabase/Google
  login/, onboarding/   Inloggning + favoritlag-val
  stats/                Publik rå-förhandsvisning av importerad data
components/
  auth/                 LoginButton, LogoutButton
lib/
  supabase/             Supabase-klienter (browser, server, admin) + DB-typer
  football/             resolve-team, tools (delad logik), tool-definitions,
                         tool-dispatch — används av både API-routor och chatten
  i18n/sv.ts             All UI-/systemprompt-text samlad på ett ställe
  api-football/          Klient mot API-Football (throttling, dagskvot)
scripts/import/          Import-script (körs manuellt under byggfasen)
supabase/migrations/     SQL-schema, körs i nummerordning i Supabase SQL Editor
proxy.ts                 Next.js proxy/middleware — refreshar auth-sessionen
```

## Teknisk stack

Next.js · Supabase (Postgres + Auth) · Claude API (Haiku 4.5, tool-calling) · Vercel (hosting, kommer vid lansering)
