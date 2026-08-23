-- ============================================================================
-- OVR v2.1 — utländsk speltid samma säsong + städning av felaktiga ligarader
-- ============================================================================
-- Uppföljning till 20260823130000_ovr_v2.sql, som redan är körd. Kör INTE om
-- den migrationen — den skapar tabellerna och faller på "relation
-- league_coefficients already exists". Kör den här i stället.
--
-- Allt nedan är skrivet för att kunna köras om utan att gå sönder
-- (if not exists / delete på ett mönster), och för att fungera både på en
-- databas där 130000 kördes i sin FÖRSTA form och på en färsk databas där
-- 130000 kördes i sin nuvarande form.

-- ---------------------------------------------------------------------------
-- 1. Två nya kolumner på player_ratings
-- ---------------------------------------------------------------------------
-- external_minutes: speltid SAMMA säsong utanför Allsvenskan (utländsk liga,
-- lägre division, europaspel) som räknats in i det observerade underlaget. En
-- spelare som gjorde halva året i MLS har spelat fotboll hela året, och betyget
-- ska bygga på allt fram till bedömningstillfället. Viktas rent på minuter och
-- ligajusteras; samma säsong ger ingen egen bonus.
--
-- unrated_minutes: speltid vi KÄNNER TILL men inte kan värdera — cupspel
-- (blandar divisioner), träningsmatcher, ungdomsserier, och seriespel utan
-- verifierad ligakoefficient. Påverkar inte betyget med en decimal. Finns för
-- att luckan ska vara synlig i stället för att döljas av en gissad koefficient,
-- och sänker confidence i proportion till sin andel av årets speltid.
alter table public.player_ratings
  add column if not exists external_minutes integer not null default 0,
  add column if not exists unrated_minutes integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Ta bort de felaktiga platshållarraderna i league_coefficients
-- ---------------------------------------------------------------------------
-- Den första versionen av seeden skrev rader med påhittade namn ("Cup 290")
-- för tolv liga-id som var GISSADE — härledda ur en inventeringsutskrift som
-- visade antal rader, inte id. Två av dem pekade på riktiga serier och uteslöt
-- dem därmed ur alla betyg:
--
--     290  ->  Persian Gulf Pro League (Iran), 11 330 minuter i vår data
--     169  ->  Super League (Kina),            33 942 minuter i vår data
--
-- och ett tredje (187) existerar inte alls i datan.
--
-- Alla tolv raderna raderas här. Elva av dem skrivs omedelbart tillbaka med
-- korrekt namn, land och klassificering av `npm run import ovr`, som numera
-- seedar ur lib/ovr/league-registry.ts — en fil GENERERAD ur den faktiska
-- datan (scripts/generate-league-registry.ts), inte skriven för hand. Den
-- tolfte (187) försvinner för gott.
--
-- Mönstret träffar bara de genererade platshållarna: 'Cup ' följt av enbart
-- siffror. Riktiga ligor som faktiskt HETER "Cup" i källdatan (id 147 och 167)
-- matchar inte och rörs inte av namnet — de fångas i stället av registrets
-- kind-klassificering.
delete from public.league_coefficients
where league_name ~ '^Cup [0-9]+$';

-- ---------------------------------------------------------------------------
-- 3. Index för de nya uppslagen
-- ---------------------------------------------------------------------------
-- Scout och chatboten kommer vilja fråga "vilka spelare har speltid vi inte
-- kan värdera?" — både för att sätta en varning i UI:t och för att prioritera
-- vilka ligor som är värda att kalibrera först.
create index if not exists player_ratings_unrated_idx
  on public.player_ratings (season_id, unrated_minutes desc)
  where unrated_minutes > 0;

-- ---------------------------------------------------------------------------
-- EFTER DEN HÄR MIGRATIONEN
-- ---------------------------------------------------------------------------
--   npm run import ovr
--
-- Den seedar om league_coefficients ur ligaregistret (355 ligor: 238 serier,
-- 112 cuper, 1 träningsmatchsform, 4 ungdomsserier) och räknar om alla
-- säsonger med config-version ovr-v2.1.0. Befintliga rader i player_ratings
-- uppdateras på plats; rader som blivit inaktuella städas bort av scriptet
-- självt, se refresh-ovr.ts.
--
-- Rader där någon satt calibrated = true skrivs ALDRIG över av seeden. Just nu
-- finns inga sådana — samtliga koefficienter är fortfarande kvalificerade
-- gissningar, och ska förbli markerade som det tills de mätts mot faktiska
-- övergångar.
