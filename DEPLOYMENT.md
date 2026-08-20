# Deploy & schemaläggning (steg 10/10, Ultra-plan-datalagret)

Den här filen dokumenterar vad steg 10 byggde och vad som krävs för att
faktiskt AKTIVERA det — repot har fram tills nu aldrig varit deployat
någonstans (ingen `vercel.json`, ingen git remote, ingen `.vercel`-koppling
fanns innan detta steg). Koden nedan är klar och verifierad lokalt, men
kräver att du gör de här stegen själv (kontoval/betalning/git-koppling är
inget jag kan göra åt dig).

## Vad som byggdes

- `app/api/cron/pre-match/route.ts`, `.../live/route.ts`, `.../finalize/route.ts`
  — cron-triggerbara wrappers runt steg 5/6/7:s pipelines
  (`scripts/import/pre-match-pipeline.ts`, `live-pipeline.ts`, `finalize-match.ts`).
  Skyddade av `CRON_SECRET` (se nedan).
- `vercel.json` — schemat, se tabellen nedan.
- `lib/cron/rate-limit-snapshot.ts` — loggar API-Football:s egna dygnskvot-
  avläsning till `ingestion_log` efter varje cron-körning, grunden för
  adminpanelens nya "API-Football-budget"-kort.
- De sju bakomliggande pipeline-/importfunktionerna tar nu en valfri
  `supabase`-parameter (defaultar till scriptens egna CLI-klient) så samma
  funktion kan återanvändas av både `npm run import <steg>` och en
  cron-route utan att koden dubbleras.
- **Säkerhetsspärr på `/dev-login`** (`app/dev-login/page.tsx`): sidan
  loggade tidigare in som `test@allsvenskan.local` (uppgraderat till admin)
  utan någon spärr alls — vem som helst hade kunnat besöka
  `dinapp.vercel.app/dev-login` på en publik deploy och logga in som admin.
  404:ar nu bort sig själv i produktionsbygget (`process.env.NODE_ENV ===
  "production"`, inlineat av `next build`), fungerar fortfarande i
  `next dev`. Verifierat med en riktig `next build && next start` lokalt
  (se nedan) innan detta ansågs klart.

## Steg för att aktivera

1. **Skapa ett GitHub-repo och pusha dit** (repot har ingen remote idag):
   ```bash
   git remote add origin <din-github-url>
   git push -u origin master
   ```
2. **Koppla repot till ett Vercel-projekt** (vercel.com → New Project → importera GitHub-repot).
3. **Sätt miljövariablerna** i Vercel-projektets Settings → Environment Variables — samma som i din lokala `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `API_FOOTBALL_KEY`, `ANTHROPIC_API_KEY` (och övriga chatten redan använder).
4. **Sätt en `CRON_SECRET`** — en slumpad sträng, minst 16 tecken (t.ex. en lösenordsgenerator). Vercel skickar den automatiskt som `Authorization: Bearer <CRON_SECRET>` på varje cron-anrop; route-handlern jämför den mot miljövariabeln.
5. **Deploya.** Cron-jobben aktiveras automatiskt från `vercel.json` vid deploy.

## Schema — Hobby-anpassat (2026-08-20)

Användarens beslut: vänta med Vercel Pro tills produkten är mogen för
riktig drift/betalande användare, deploya till gratisplanen (Hobby) under
tiden. `vercel.json` är därför medvetet Hobby-säkert redan nu, inte satt
till planens ursprungliga Pro-granularitet:

| Route | Schema i `vercel.json` | Fungerar på Hobby? |
|---|---|---|
| `/api/cron/finalize` | `0 3 * * *` (en gång/dygn, 03:00 UTC) | ✅ Ja — matchar planens egen naturliga takt (ett efterhandspass räcker) |
| `/api/cron/pre-match` | `0 8 * * *` (en gång/dygn, 08:00 UTC) | ✅ Ja, men degraderat — skador/laguppställning fångas bara en gång/dygn, inte kontinuerligt nära avspark |
| `/api/cron/live` | **inte med i `vercel.json` just nu** | Utelämnad medvetet — en gång/dygn hade varit meningslöst för minut-för-minut-livespårning (matchen hade oftast redan hunnit sluta) |

Verifierat mot Vercels egen dokumentation (2026-08-20, inte gissat):
**Hobby-konton tillåter bara cron-jobb en gång/dygn** — ett tätare schema
(`*/30 * * * *`, `* * * * *`) gör att HELA deploy:en misslyckas, inte bara
att det jobbet degraderas. Därför är `pre-match` satt till en gång/dygn och
`live` helt borttagen ur schemat ovan.

`app/api/cron/live/route.ts` finns fortfarande kvar och deployas — den går
att anropa manuellt (t.ex. `curl` med rätt `CRON_SECRET`) för att testa
mot en riktig match, den körs bara inte på ett schema än.

**Vid uppgradering till Pro**, lägg tillbaka en rad i `vercel.json`:
```json
{ "path": "/api/cron/live", "schedule": "* * * * *" }
```
och byt gärna `pre-match` till `*/30 * * * *` för tätare
laguppställnings-pollning nära avspark. Ingen kodändring behövs, bara
schemat.

## Vad som INTE byggdes i steg 10

- **Faktisk deploy** — inget konto/repo/projekt har skapats åt dig.
- **Multi-liga-stöd bortom vad som redan fanns** — verifierat (inte antaget)
  att importlagret redan är parametriserat via EN konstant
  (`ALLSVENSKAN_LEAGUE_EXTERNAL_ID` i `scripts/import/config.ts`) och att
  hela analyslagret (`lib/football/*`) filtrerar på `league_id` (en riktig
  FK), aldrig ett hårdkodat ligannamn — en andra liga skulle alltså gå att
  lägga till genom att köra importscripten med en annan konfiguration, inte
  genom att skriva om frågelogik. Ingen andra liga är faktiskt importerad
  än, och `IMPORT_TEAMS`/`IMPORT_SEASONS` i `config.ts` är fortfarande
  strukturerade för EN liga i taget — en riktig flerliga-vy (flera
  konfigurationer samtidigt) är inte byggd, för att den aldrig efterfrågats.
