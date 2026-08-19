# Setup: Supabase + Google-inlogg

Den här guiden täcker det du (kontoägaren) behöver göra manuellt för att
koppla in riktiga Supabase- och Google-uppgifter. Koden är redan klar och
väntar bara på miljövariablerna.

## 1. Skapa Supabase-projekt

1. Gå till [supabase.com](https://supabase.com) → skapa konto/logga in → **New project**.
2. Välj valfritt namn (t.ex. `allsvenskan-ai`), region nära Sverige (t.ex. `eu-north-1`/Stockholm om tillgängligt, annars Frankfurt), och ett starkt databaslösenord (spara det — behövs sällan men bra att ha).
3. Vänta tills projektet är klart (tar ~1–2 minuter).

## 2. Kör databasschemat

1. Öppna **SQL Editor** i Supabase-dashboarden.
2. Kör filerna i `supabase/migrations/` **i nummerordning**, en i taget (klistra in innehållet, klicka **Run**):
   - `20260819120000_profiles.sql`
   - `20260819120100_football_schema.sql`
   - `20260819120200_unanswered_questions.sql`
3. Verifiera under **Table Editor** att tabellerna dök upp: `profiles`, `league`, `season`, `team`, `team_trophy`, `team_legend`, `team_rivalry`, `player`, `fixture`, `event`, `statistics`, `unanswered_questions`.

> Alternativ: om du föredrar Supabase CLI (`npx supabase login` → `npx supabase link` → `npx supabase db push`) fungerar det också, migrationsfilerna ligger redan i CLI:ns standardformat.

## 3. Hämta API-nycklar

I Supabase-dashboarden: **Project Settings → API**.

Kopiera till en ny fil `.env.local` (kopiera `.env.local.example` som mall):

```bash
cp .env.local.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` — "Project URL"
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — "anon public" key
- `SUPABASE_SERVICE_ROLE_KEY` — "service_role" key (hemlig, endast server-side)

## 4. Google-inlogg

Två delar krävs: OAuth-uppgifter i Google Cloud Console + aktivera Google-provider i Supabase.

### 4a. Google Cloud Console

1. Gå till [console.cloud.google.com](https://console.cloud.google.com) → skapa ett nytt projekt (eller återanvänd ett).
2. **APIs & Services → OAuth consent screen**: sätt upp en enkel extern consent screen (appnamn, din e-post). "Testing"-läge räcker under byggfasen.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: lägg till Supabase callback-URL:en. Den hittar du i Supabase under **Authentication → Providers → Google** när du öppnar den (formatet är `https://<project-ref>.supabase.co/auth/v1/callback`).
4. Spara **Client ID** och **Client Secret**.

### 4b. Supabase

1. **Authentication → Providers → Google** → aktivera → klistra in Client ID + Client Secret från steg 4a → **Save**.
2. Under **Authentication → URL Configuration**, sätt:
   - Site URL: `http://localhost:3000` (under byggfasen)
   - Redirect URLs: lägg till `http://localhost:3000/auth/callback`

När ni går live senare uppdateras dessa till den riktiga domänen (se PROJEKT_BRIEF.md, "Domän").

## 5. Testa

```bash
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000) → du ska landa på `/login` → klicka **Logga in med Google** → efter inloggning hamnar du på startsidan och ser din e-post.

Kontrollera i Supabase **Table Editor → profiles** att en rad skapades automatiskt, och att din egen rad (e-post `ci.carlsson97@gmail.com`) fick `role = admin` medan andra konton får `role = user`.
