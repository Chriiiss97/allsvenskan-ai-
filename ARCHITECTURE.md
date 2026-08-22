# Architecture

Hur systemet faktiskt är uppbyggt — inte hur planen (`PROJEKT_BRIEF (1).md`)
ursprungligen beskrev det. Se [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) för
varför koden alltid vinner över planeringsdokument.

## Systemöversikt

```
┌──────────────────┐
│   API-Football    │  extern data, betald "Ultra"-plan (75 000 anrop/dag)
│  (api-sports.io)  │  lib/api-football/client.ts + types.ts
└─────────┬──────────┘
          │  manuellt körda Node-script (INGEN cron/schemaläggning än)
          ▼
┌──────────────────────────┐
│  scripts/import/*.ts       │  npm run import <steg>
│  (league/teams/players/     │  se INGESTION.md
│   fixtures/events/lineups/  │
│   team-stats/player-stats/  │
│   coaches/standings/facts)  │
└─────────┬─────────────────┘
          │  service-role-nyckel (kringgår RLS helt)
          ▼
┌──────────────────────────┐
│   Supabase (Postgres)      │  se DATABASE.md
│   RLS: publik läsning,      │
│   skrivning bara server-    │
│   side                      │
└─────────┬─────────────────┘
          │  anon/session-nyckel, RLS gäller
          ▼
┌──────────────────────────────────────────┐
│  lib/football/tools.ts                     │  delad affärslogik — EN
│  (getTopScorers, getCards, getTeamFacts,    │  implementation, två anropare
│   getFixtures, getPlayerProfile,            │
│   computePlayerDNA importeras separat,      │
│   getTeamComparison, getTeamProfile,        │
│   getMatchReport, ...)                      │
└───────┬───────────────────────┬────────────┘
        │                       │
        ▼                       ▼
┌───────────────────┐   ┌────────────────────────────┐
│  app/api/**         │   │  app/(app)/data/** (server   │
│  REST-routes,        │   │  components) — anropar       │
│  "för manuell         │   │  tools.ts DIREKT, ingen       │
│  testning/felsökning" │   │  HTTP-roundtrip               │
│  (egen kodkommentar)  │   └────────────────────────────┘
└───────────────────┘
        │
        │  (chatten går INTE via app/api/**-routorna)
        ▼
┌──────────────────────────────────────────┐
│  app/api/chat/route.ts                     │
│   1. auth + kvot (increment_message_quota)  │
│   2. spara/hämta konversation                │
│   3. Claude (claude-haiku-4-5) + FOOTBALL_TOOLS │
│   4. tool_use → lib/football/tool-dispatch.ts │
│      → samma tools.ts-funktioner              │
│   5. logga tool-anrop + tokenkostnad          │
│      (message_tool_call, message_usage)       │
└─────────┬──────────────────────────────────┘
          ▼
   components/chat/ChatInterface.tsx (app/(app)/chat/page.tsx)
```

**Nyckelinsikt:** det finns bara EN implementation av varje dataoperation
(i `lib/football/tools.ts` och `lib/football/player-dna.ts`). REST-routorna
under `app/api/**`, Data-sektionens server components, och chattens
tool-dispatch är tre olika **anropare** av samma funktioner — ingen av dem
duplicerar frågelogik. Se kodkommentaren överst i `tools.ts`.

## Lagren, som i "Allsvenskan Datalager"-planen

Migrationskommentaren i `20260820120000_match_depth_schema.sql` beskriver
fyra tänkta lager. Verklig implementationsstatus:

| Lager | Vad det är | Status |
|---|---|---|
| **RAW** | `api_raw_response` — spara varje dyrt API-svar rått som JSONB | 🟡 Tabellen finns, **ingen kod skriver till den** — se [INGESTION.md](INGESTION.md#raw-lagret-är-inte-kopplat) |
| **CANONICAL** | De strukturerade tabellerna (`fixture`, `statistics`, `fixture_player_stats`, `fixture_team_stats`, `fixture_lineup`, ...) | 🟢 Byggt och fyllt av import-scripten |
| **DERIVED** | Ren beräkning ovanpå CANONICAL (t.ex. form, trender) — "byggs i ett senare steg" enligt planen | 🔴 Inte påbörjat som eget lager. `getTeamComparison`s `computeFormRecord` är i praktiken en liten derived-beräkning, men körs on-demand i tool-lagret, inte som ett eget lagrat lager |
| **PRODUCT** | Player/Team/Match DNA | 🟡 Bara Player DNA är byggt ([PLAYER_DNA.md](PLAYER_DNA.md)). Team DNA/Match DNA existerar bara som ord i planen — se [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md) för vad som faktiskt finns istället |

## Autentisering

- Supabase Auth, Google OAuth (`components/auth/LoginButton.tsx` →
  `supabase.auth.signInWithOAuth({ provider: "google" })` →
  `/auth/callback`).
- `public.profiles` speglar `auth.users` med en `role`-kolumn
  (`user`/`admin`), satt automatiskt av en trigger (`handle_new_user()`)
  vid första inloggning — ägarens e-post (se `userEmail` i miljön) blir
  hårdkodat `admin`.
- 🟡 `app/dev-login/page.tsx` — tillfällig lösenords-inloggning för manuell
  testning (`test@allsvenskan.local`), explicit markerad i filens egen
  kommentar att tas bort innan lansering. Google OAuth-koden är klar men
  kräver riktiga Google Cloud-uppgifter (se `SETUP.md`) som ännu inte är
  inkopplade i produktion.
- `proxy.ts` (Next.js middleware-konventionen, döpt `proxy` i den här
  Next.js-versionen — se `AGENTS.md`s notis om att läsa lokal Next-dokumentation
  innan man antar API:t) kör `lib/supabase/middleware.ts`s `updateSession()`
  på varje request för att hålla auth-cookien färsk.
- Route-skydd: `app/(app)/layout.tsx` redirectar till `/login` om ingen
  användare; `/admin`-sidan dubbelkollar `role === 'admin'` server-side
  (utöver RLS-policyn `is_admin()`).

## Databasåtkomst — två olika nycklar, medvetet

- **Import-script** (`scripts/import/admin-client.ts`) använder
  `SUPABASE_SERVICE_ROLE_KEY` — kringgår RLS helt. Detta är varför
  `football_schema`-migrationen inte har några INSERT/UPDATE-policyer: all
  skrivning sker server-side med den nyckeln, aldrig från klienten.
- **Appen** (`lib/supabase/server.ts`/`client.ts`) använder
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` + användarens session — RLS gäller fullt
  ut (publik läsning av fotbollsdata, ägarskaps-scopad läsning av
  konversationer, admin-only för analystabeller).

## Var beräkning sker

Ingen separat "backend-server" utöver Next.js själv — allt körs som Next.js
route handlers eller React server components mot Supabase direkt. Player
DNA, jämförelser och matchrapporter beräknas **on-demand vid varje
sidladdning/tool-anrop**, inte förberäknat eller cachat. `PROJEKT_BRIEF
(1).md`s idé om caching av t.ex. topscorers är 🔴 inte implementerad —
varje anrop går till Supabase på nytt (Supabase själv, inte appen, står för
eventuell frågecache).

## Vad som INTE finns (arkitektoniskt)

- 🔴 Ingen live-poller/websocket-lager (planerat i `PROJEKT_BRIEF (1).md`
  fas 3, `fixture_live_snapshots`-tabellen finns men är tom, se
  [DATABASE.md](DATABASE.md#tomma-tabeller)).
- 🔴 Ingen schemalagd/cron-driven import — allt körs manuellt
  (`npm run import <steg>`) av ägaren.
- 🔴 Ingen betalnings-/prenumerationsinfrastruktur (Stripe var planerat,
  inte påbörjat).
- 🔴 Ingen produktionsdeploy (Vercel nämnt i planen, inte kopplat; inget
  `git remote`).
