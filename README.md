# Allsvenskan-chattbot

Chatta med Allsvenskan-statistik. Se [`PROJEKT_BRIEF (1).md`](<PROJEKT_BRIEF (1).md>) för full projektkontext, beslut och roadmap.

## Status

Steg 1–2 i roadmapen är klara:

1. **Projektstruktur** — Next.js (App Router, TypeScript, Tailwind) med `/app`, `/lib`, `/components`, plus Supabase Auth (Google-inlogg) inkopplat med `role`-fält (`user`/`admin`) på användartabellen.
2. **Databasschema** — `league`, `season`, `team` (+ `team_trophy`/`team_legend`/`team_rivalry`), `player`, `fixture`, `event`, `statistics`, `unanswered_questions`. Säsongs-/liga-agnostiskt och uppdelat per tävling, se `supabase/migrations/`.

Nästa steg (ej påbörjat): API-Football-koppling + import-script (steg 3), lagfakta (steg 4), tool-lager (steg 5), chat-endpoint med Claude (steg 6), chat-UI (steg 7).

## Kom igång

Se [`SETUP.md`](SETUP.md) för hur du skapar Supabase-projektet, kör databasschemat och kopplar in Google-inlogg — det krävs innan appen fungerar.

```bash
npm install
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

## Struktur

```
app/                  Next.js App Router — sidor och route handlers
  auth/callback/       OAuth-callback för Supabase/Google
  login/                Inloggningssida
components/
  auth/                 LoginButton, LogoutButton
lib/
  supabase/             Supabase-klienter (browser, server, admin) + DB-typer
  i18n/sv.ts            All UI-/systemprompt-text samlad på ett ställe
supabase/
  migrations/           SQL-schema, körs i nummerordning i Supabase SQL Editor
proxy.ts               Next.js proxy/middleware — refreshar auth-sessionen
```

## Teknisk stack

Next.js · Supabase (Postgres + Auth) · Claude API (kommer i steg 6) · Vercel (hosting, kommer vid lansering)
