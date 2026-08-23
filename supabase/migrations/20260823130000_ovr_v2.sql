-- ============================================================================
-- OVR v2 — player_ratings + league_coefficients (2026-08-23)
-- ============================================================================
-- Ersätter player_season_rating (20260821120000) som ENDA källa till spelarens
-- OVR. Den gamla tabellen lämnas orörd av den här migrationen så att den nya
-- motorn kan verifieras mot den innan något tas bort — se den avslutande
-- kommentaren om avvecklingen längst ned.
--
-- Varför en ny tabell i stället för nya kolumner på den gamla:
--   - Kornigheten ändras. player_season_rating har grain (player_id, season_id)
--     utan klubb. OVR v2 taggar per (player_id, season_id, club_id) eftersom en
--     spelare som gjorde 8 mål på våren i en klubb och 1 på hösten i en annan
--     inte ska slås ihop blint (specens 4.4).
--   - Positionsgrupperna ändras från fyra grova till sex positionsspecifika.
--     Samma kolumnnamn med en annan värdemängd hade varit en tyst fälla för
--     all kod som redan läser den gamla.
--   - Betyget är numeriskt med en decimal, inte heltal. Med sex grupper och så
--     få som 20 målvakter per säsong är skillnaden mellan två grannar i
--     tabellen ofta mindre än ett helt OVR-steg.
--
-- ----------------------------------------------------------------------------
-- OM SKALAN
-- ----------------------------------------------------------------------------
-- ovr ligger på en INTERN ALLSVENSK skala (48–91). Den är INTE jämförbar med
-- FIFA/EA FC:s globala skala — en 84:a här betyder "top ~3 % i sin
-- positionsgrupp i Allsvenskan", ingenting mer. Se lib/ovr/config.ts.

-- ---------------------------------------------------------------------------
-- league_coefficients — hur en annan ligas statistik översätts till allsvensk
-- nivå. Egen tabell (inte en konstant i koden) uttryckligen för att
-- koefficienterna ska gå att justera utan en deploy.
--
-- calibrated är default false och SKA förbli false tills någon faktiskt mätt
-- utfallet av övergångar in i och ut ur Allsvenskan. Startvärdena är
-- kvalificerade gissningar. Fältet finns för att göra det omöjligt att senare
-- glömma bort att de var det.
-- ---------------------------------------------------------------------------
create table public.league_coefficients (
  -- API-Footballs league-id. Samma nyckel som player_career_stint.league_external_id,
  -- så prior kan slå upp koefficienten utan en namnmatchning (som hade gått
  -- sönder på "1. Division", vilket finns i både Danmark, Norge och Cypern).
  league_external_id integer primary key,
  league_name text not null,
  country text,
  coefficient numeric(4, 2) not null check (coefficient > 0 and coefficient <= 3),
  calibrated boolean not null default false,
  -- true för cupturneringar och annat som blandar divisioner i samma tabell.
  -- Sådan statistik säger nästan ingenting om nivå och utesluts helt ur prior.
  excluded boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_league_coefficients_updated_at
  before update on public.league_coefficients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- player_ratings — den nya källan till sanning för OVR.
-- ---------------------------------------------------------------------------
create table public.player_ratings (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  season_id bigint not null references public.season (id) on delete cascade,
  -- Redundant mot season.year men sparad ändå: nästan varje läsning av den här
  -- tabellen vill filtrera eller sortera på år, och en join per fråga för ett
  -- heltal som aldrig ändras är inte värt det.
  season_year integer not null,
  -- Klubben betyget avser. null bara om spelaren saknar klubbkoppling den
  -- säsongen (ska inte hända för någon med speltid).
  club_id bigint references public.team (id) on delete set null,

  -- Positionsbedömningen är härledd ur var spelaren FAKTISKT startat de senaste
  -- tolv månaderna (fixture_lineup_player.grid), inte ur player.position.
  position_group text not null check (position_group in ('GK', 'CB', 'FB', 'CM', 'AM', 'ST')),
  secondary_position_group text check (secondary_position_group in ('GK', 'CB', 'FB', 'CM', 'AM', 'ST')),
  -- Andel av startminuterna som låg i primärgruppen. 0 betyder att ingen start
  -- fanns i fönstret och att player.position fick avgöra — läs betyget därefter.
  position_confidence numeric(4, 3) not null default 0,

  -- Huvudbetyget: observerat och historik hopvägt med bayesiansk shrinkage.
  ovr numeric(4, 1),
  -- Enbart innevarande säsong, utan shrinkage. Vad spelaren FAKTISKT gjort.
  current_season_rating numeric(4, 1),
  -- Enbart historiken. Vad vi trodde om honom innan säsongen började.
  -- Skillnaden mot current_season_rating är den intressanta signalen.
  historical_rating numeric(4, 1),
  -- Ren åldersprojektion mot 27 år. INTE en scoutbedömning — den vet ingenting
  -- om talang, bara att en 19-åring typiskt har utrymme kvar som en 29-åring
  -- inte har.
  potential numeric(4, 1),

  -- Form är MEDVETET separat från ovr och blandas aldrig in i det. OVR ska vara
  -- trögt; form ska vara snabbt. Att slå ihop dem gör båda värdelösa.
  form numeric(3, 1) not null default 0 check (form >= -10 and form <= 10),

  confidence numeric(4, 3) not null default 0 check (confidence >= 0 and confidence <= 1),
  confidence_tier text check (confidence_tier in ('låg', 'medel', 'hög')),
  -- Hur stor andel av betyget som kommer från historik i stället för från
  -- innevarande säsong. Högt värde = "det här är mest vad vi visste sedan
  -- tidigare". Finns för felsökning och för att chatboten ska kunna säga
  -- "baserat på begränsat underlag den här säsongen".
  prior_weight numeric(4, 3) not null default 0 check (prior_weight >= 0 and prior_weight <= 1),

  minutes_played integer not null default 0,
  -- Minuter SAMMA säsong utanför Allsvenskan (utländsk liga, lägre division,
  -- europaspel) som räknats in i det observerade underlaget. En spelare som
  -- gjorde halva året i MLS har spelat fotboll hela året, och betyget bygger på
  -- allt fram till bedömningstillfället — inte bara på de allsvenska minuterna.
  -- Viktas rent på minuter, ligajusterat; samma säsong ger ingen egen bonus.
  external_minutes integer not null default 0,
  -- Minuter vi KÄNNER TILL men inte kan värdera: cupspel (blandar divisioner),
  -- träningsmatcher, ungdomsserier, och seriespel utan verifierad
  -- ligakoefficient. De påverkar inte betyget med en decimal — de finns här och
  -- i historical_evidence.unrated_leagues för att luckan ska vara SYNLIG.
  -- Hellre det än en tyst standardkoefficient: i en tidig version fick varje
  -- okänd liga 0,60, vilket lät 19 % av underlaget vila på en siffra ingen
  -- bestämt. Sänker confidence i proportion till sin andel.
  unrated_minutes integer not null default 0,

  -- Delbetygen. Egna kolumner i stället för en jsonb-klump eftersom Scout ska
  -- kunna sortera och filtrera på dem direkt i databasen.
  -- goalkeeping är null för utespelare, de fem andra är null för målvakter.
  subscore_finishing numeric(4, 1),
  subscore_passing numeric(4, 1),
  subscore_dribbling numeric(4, 1),
  subscore_defending numeric(4, 1),
  subscore_duels numeric(4, 1),
  subscore_goalkeeping numeric(4, 1),

  -- Vilka säsonger, klubbar och ligor som bidrog till prior och med vilken
  -- vikt, plus percentilnedbrytningen per mått. Gör varje betyg härledbart i
  -- efterhand utan att köra om motorn.
  historical_evidence jsonb not null default '{}'::jsonb,

  -- Vilken version av lib/ovr/config.ts som räknade fram raden. Utan den går
  -- det inte att veta om två rader är jämförbara efter en viktjustering.
  config_version text not null,
  calculated_at timestamptz not null default now(),

  -- En rad per spelare och säsong. Klubbytet mitt i säsongen syns i club_id
  -- (senaste klubben) och i historical_evidence, inte som två rader — betyget
  -- avser spelarens säsong, inte hans anställning.
  unique (player_id, season_id)
);

create index player_ratings_player_idx on public.player_ratings (player_id);
create index player_ratings_season_idx on public.player_ratings (season_id);
create index player_ratings_season_year_idx on public.player_ratings (season_year);
create index player_ratings_club_idx on public.player_ratings (club_id);
-- Topplistor och Scout-sortering: "bästa OVR i en säsong", med och utan
-- positionsfilter. Partiellt index — rader utan ovr är aldrig intressanta att
-- sortera fram.
create index player_ratings_leaderboard_idx
  on public.player_ratings (season_id, ovr desc)
  where ovr is not null;
create index player_ratings_position_leaderboard_idx
  on public.player_ratings (season_id, position_group, ovr desc)
  where ovr is not null;

alter table public.league_coefficients enable row level security;
alter table public.player_ratings enable row level security;

-- Samma princip som all annan fotbollsdata: offentlig läsning, skrivning bara
-- server-side med service role-nyckeln (kringgår RLS helt) via
-- scripts/import/refresh-ovr.ts.
create policy "Public read league_coefficients" on public.league_coefficients for select using (true);
create policy "Public read player_ratings" on public.player_ratings for select using (true);

-- ---------------------------------------------------------------------------
-- AVVECKLING AV player_season_rating
-- ---------------------------------------------------------------------------
-- Den gamla tabellen droppas INTE här. Ordningen är medveten:
--   1. Den här migrationen körs och nya betyg räknas fram.
--   2. Resultatet verifieras mot den gamla motorn.
--   3. Applikationen läggs om till player_ratings (samtliga läsvägar).
--   4. Först när ingen kod längre refererar player_season_rating droppas den,
--      i en egen migration.
--
-- Tabellen innehåller ingen data som inte går att räkna fram igen — den är ett
-- cachelager för en beräkning, inte en primärkälla. Historiken går alltså inte
-- förlorad när den droppas, förutsatt att player_ratings är backfillad för
-- samma säsonger först.
