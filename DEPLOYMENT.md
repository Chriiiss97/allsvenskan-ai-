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
- **`.github/workflows/pipeline-poll.yml`** (ny): anropar `pre-match` och
  `live` var 5:e minut via GitHub Actions istället för Vercel Cron — se
  "Schema" nedan för varför.

## Steg för att aktivera

1. **Skapa ett GitHub-repo (publikt) och pusha dit** (repot har ingen remote
   idag). Publikt valt medvetet 2026-08-20 för att få obegränsade gratis
   GitHub Actions-minuter (se "Schema" nedan) — **verifierat innan detta
   beslut** att inga hemligheter någonsin committats: `git log --all` för
   `.env*`-filer och en grep över hela historiken för nyckelmönster
   (`sk-ant-`, JWT-liknande strängar, hårdkodade `API_FOOTBALL_KEY`-värden)
   gav noll träffar, och `.gitignore` har haft `.env*` med sedan start.
   ```bash
   git remote add origin <din-github-url>
   git push -u origin master
   ```
2. **Koppla repot till ett Vercel-projekt** (vercel.com → New Project → importera GitHub-repot).
3. **Sätt miljövariablerna** i Vercel-projektets Settings → Environment Variables — samma som i din lokala `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `API_FOOTBALL_KEY`, `ANTHROPIC_API_KEY` (och övriga chatten redan använder). **`SPORTMONKS_API_TOKEN` KRÄVS numera också.** Fram till Fas 20 användes Sportmonks bara av importskript som kördes lokalt, och den här raden sa att variabeln inte behövde sättas i Vercel. Fas 21 (2026-08-23) gjorde Sportmonks-pollningen till en del av live-ticken (`scripts/import/sportmonks-live.ts`, anropad av `/api/cron/live`) — utan token får produktionen ställning och minut från API-Football, men INGEN matchklocka, matchkommentar eller utökad statistik. Felet är tyst i produkten: live-ticken loggar `! Sportmonks live-tick misslyckades helt: …` och fortsätter, precis som avsett, så matchhubben ser bara tom ut. Bekräftat i drift samma dag: cron-routen kördes ~100 gånger utan att `fixture_period`/`fixture_comment` uppdaterades.
4. **Sätt en `CRON_SECRET`** i Vercel — en slumpad sträng, minst 16 tecken (t.ex. en lösenordsgenerator).
5. **Deploya.** `finalize`-cronet aktiveras automatiskt från `vercel.json`.
6. **Sätt samma `CRON_SECRET` i GitHub** (repots Settings → Secrets and
   variables → Actions → New repository secret → `CRON_SECRET`, samma
   värde som i steg 4 — måste matcha exakt).
7. **Lägg till en repository variable `APP_URL`** (samma meny, fliken
   "Variables") — din deployade Vercel-URL, t.ex.
   `https://din-app.vercel.app` (ingen avslutande `/`).
8. `.github/workflows/pipeline-poll.yml` börjar köra automatiskt så fort
   den finns på default-branchen (kräver inget separat aktiveringssteg).

## Schema (2026-08-20)

Användarens beslut: vänta med Vercel Pro tills produkten är mogen för
riktig drift/betalande användare, deploya till gratisplanen (Hobby) under
tiden. Vercel Hobby tillåter bara EN cron-körning/dygn (verifierat mot
Vercels egen dokumentation, inte gissat — ett tätare schema i
`vercel.json` gör att HELA deployen misslyckas, inte bara att det jobbet
degraderas). Lösningen: låt GitHub Actions vara väckarklockan för allt som
behöver köras oftare, Vercel Cron sköter bara det som verkligen räcker med
en gång/dygn.

| Route | Körs av | Schema | Varför |
|---|---|---|---|
| `/api/cron/finalize` | Vercel Cron (`vercel.json`) | `0 3 * * *` (en gång/dygn) | Matchar planens egen naturliga takt — ett efterhandspass räcker, Hobby-kompatibelt som det är. |
| `/api/cron/pre-match` | GitHub Actions (`.github/workflows/pipeline-poll.yml`) | Var 5:e minut | Skador/laguppställning ska fångas nära avspark, inte en gång/dygn. |
| `/api/cron/live` | GitHub Actions (samma workflow) | Var 5:e minut | Grövre än planens ursprungliga ~45–60s-mål, men oändligt mycket bättre än Hobbys 1x/dygn-tak — och gratis. |

**Varför GitHub Actions och inte bara vänta på Pro:** GitHub Actions kortaste
tillåtna intervall är 5 minuter (verifierat mot GitHubs dokumentation).
Minutkvoten skiljer sig radikalt mellan publikt och privat repo: **privat**
ger 2 000 gratis minuter/månad (räcker till ungefär `*/30`, inte tätare
utan att bli faktureringspliktig), **publikt** är helt obegränsat gratis —
därför valdes publikt repo, med säkerhetsgranskningen i steg 1 ovan som
förutsättning.

**Om repot flyttas till privat senare** (planerat, efter att produkten är
mogen) ändras INGEN arkitektur — bara cron-uttrycket i
`pipeline-poll.yml` behöver bli glesare, t.ex.:
```yaml
- cron: "*/30 * * * *"
```
En annan känd GitHub-detalj värd att komma ihåg: schemalagda workflows i
publika repon **stängs av automatiskt efter 60 dagars total inaktivitet**
i repot (går att slå på igen manuellt) — inte en risk så länge ni
fortsätter committa, men värt att veta om projektet pausas länge.

**Vid uppgradering till Vercel Pro** går det att flytta `pre-match`/`live`
tillbaka till `vercel.json` (`*/30 * * * *` respektive `* * * * *`) och ta
bort GitHub Actions-workflowen helt, eller bara låta båda vara aktiva
samtidigt (routorna är idempotenta — se live-pipeline.ts/pre-match-
pipeline.ts, ett extra anrop är ofarligt, bara en billig "inget att göra"-
koll).

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
