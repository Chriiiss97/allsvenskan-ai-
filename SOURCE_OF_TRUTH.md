# Source of Truth

Regeln för hur en AI-agent (eller utvecklare) ska avgöra vad som är *sant*
om det här projektet, när olika källor säger olika saker — vilket händer,
eftersom projektet har flera lager dokumentation skrivna vid olika
tidpunkter (README, PROJEKT_BRIEF, kodkommentarer, minnesfiler, den här
dokumentationen).

## Prioritetsordning

```
1. FAKTISK IMPLEMENTATION        (koden i app/, lib/, scripts/ — committad OCH okommitterad)
2. FAKTISK SUPABASE-DATABAS       (supabase/migrations/*.sql — vad som FAKTISKT körts, se not nedan)
3. VERIFIERAD API-DATA             (kommentarer i koden märkta "bekräftat", "verifierat", "testat" mot API-Football)
4. AKTUELL DOKUMENTATION           (den här dokumentationsuppsättningen: PROJECT_CONTEXT.md m.fl.)
5. ROADMAP / PLANERADE FUNKTIONER (ROADMAP.md, INSIGHT_ENGINE_BACKLOG.md)
6. ÄLDRE ANTAGANDEN                (README.md, PROJEKT_BRIEF (1).md, SETUP.md — ursprunglig planering)
```

**Regeln:** en lägre nivå får aldrig motsäga en högre. Om `README.md` (nivå 6)
säger något annat än vad koden (nivå 1) faktiskt gör, är koden sann. Det
betyder INTE att README.md är fel att ha kvar — det är ett historiskt
planeringsdokument — men det ska inte tolkas som en aktuell statusrapport.

### Viktig nyans på nivå 1–2: committad vs. okommitterad kod

Det här är ett enda-utvecklare-hobbyprojekt utan CI/CD och utan push till en
delad remote (`git remote -v` är tomt — allt är lokalt). Arbetsträdet
innehåller ofta okommitterade ändringar som representerar pågående arbete,
inte experiment som ska ignoreras. Exempel vid skrivande stund
(2026-08-20): `scripts/import/config.ts` m.fl. import-script har
okommitterade ändringar som utökar datalagrets omfattning från
2022–2024/23 lag till 2016–2026/32 lag — se `git diff` och
[INGESTION.md](INGESTION.md#pågående-utökning-2016–2026-okommitterat) för
detaljer. Behandla **arbetsträdet (disk), inte `git log`,** som den mest
aktuella sanningen om koden — men flagga uttryckligen när något bara finns
okommitterat, eftersom det kan gå förlorat eller ändras innan det committas.

### Viktig nyans på nivå 2: schema-filer vs. körd databas

`supabase/migrations/*.sql` beskriver vad som SKA finnas i databasen, inte
med garanti vad som FAKTISKT finns just nu. Det här projektet har ingen
levande `supabase link`-koppling (`lib/supabase/database.types.ts` är
handskriven, inte genererad — se filens egen kommentar) och migrationer körs
manuellt i Supabase SQL Editor, en i taget, i nummerordning (se
[SETUP.md](SETUP.md)). Minnesanteckningar från tidigare sessioner har
noterat minst ett tillfälle där en migration (`20260819220000_admin_analytics.sql`)
var skriven men ännu inte körd i den riktiga databasen. **Anta aldrig att en
migrationsfil i repot faktiskt är applicerad** — appen är medvetet byggd för
att "fail open" (visa "ej tillgängligt" / hoppa över tyst) när en förväntad
tabell/kolumn saknas, se t.ex. `app/api/chat/route.ts`s kommentarer om
`feature_flag` och `message_tool_call`/`message_usage`. Detta går inte att
verifiera utan faktisk databasåtkomst — se [[verify-tool-bugs-via-live-path]]-principen
i standing constraints: lita på riktig data, inte antaganden, när det går att kontrollera.

## Statusnivåer — används i all dokumentation

| Symbol | Betyder | Krav för att sätta den |
|---|---|---|
| 🟢 IMPLEMENTERAT / VERIFIERAT | Finns i koden, går att peka på en fil/rad, och (där rimligt) verifierat mot verkligt beteende | Kod finns + logik är begriplig från koden själv |
| 🟡 PLANERAT / PÅGÅENDE | Finns som schema/typ/kommentar/roadmap-post men saknar en färdig, körbar väg genom hela systemet | Delvis kod (t.ex. tabell utan importscript) ELLER uttalad plan utan kod |
| 🔴 SAKNAS / EJ MÖJLIGT / EJ VERIFIERAT | Ingen kod, inget schema, eller API-Football ger inte den datan | Bekräftad avsaknad, inte bara "vi har inte kollat" |

En funktion som har en databastabell men INGEN kod som skriver till den
(t.ex. `api_raw_response`, `ingestion_log`, `player_injury`,
`fixture_live_snapshots` — se [DATABASE.md](DATABASE.md#tomma-tabeller))
räknas som 🟡, inte 🟢 — schema är inte implementation.

## Regeln för planerade funktioner

Planerade funktioner (roadmap, backlog, kommentarer som "kommer i steg 8")
får ALDRIG beskrivas i löptext på ett sätt som läsaren kan förväxla med
färdig funktionalitet. Skriv "Team DNA (planerat, ej byggt) ska …", aldrig
bara "Team DNA …" följt av en beskrivning som om den fanns. Se konkret
exempel: schemakommentaren i `supabase/migrations/20260820120000_match_depth_schema.sql`
nämner "PRODUCT (Player/Team/Match DNA)" som lagerbeskrivning för hela
datalagerprojektet — men bara Player DNA är faktiskt byggd
([PLAYER_DNA.md](PLAYER_DNA.md)); Team DNA/Match DNA är ord i en plan, inte
kod (se [TEAM_MATCH_ANALYSIS.md](TEAM_MATCH_ANALYSIS.md)).

## Om den här dokumentationen och koden hamnar i konflikt senare

Den här dokumentationen (skapad 2026-08-20) är en ögonblicksbild. Framtida
ändringar i koden gör delar av den föråldrade om ingen uppdaterar den i
samma veva — se [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md#håll-dokumentationen-i-synk)
för vilka dokument som hör ihop med vilka kodområden. Om du (AI-agent eller
utvecklare) upptäcker en motsägelse: koden vinner, uppdatera dokumentet, gå
vidare — fråga aldrig användaren "vilket ska jag tro på" när koden går att läsa.
