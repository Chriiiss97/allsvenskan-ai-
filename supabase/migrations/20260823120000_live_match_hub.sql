-- ---------------------------------------------------------------------------
-- Fas 21 (2026-08-23) — Matchhubben: live-lager för matchklocka, löpande
-- kommentar och full live-statistik.
--
-- BAKGRUND. Fas 20 fick live-flödet att uppdateras i rätt takt, men innehållet
-- var fortfarande tunt: fyra statistikvärden (bollinnehav, skott, skott på
-- mål, hörnor) och en minutsiffra som kom från API-Football:s `elapsed`.
-- Kravet är en riktig matchhub i klass med de bästa matchapparna.
--
-- En probe mot en PÅGÅENDE Allsvenskan-match (IFK Göteborg–Elfsborg,
-- 2026-08-23, minut 17–22) visade att vi redan betalar för allt som behövs —
-- det ligger hos Sportmonks och hämtades bara aldrig live:
--
--   include=periods     → { started: 1787486426, minutes: 22, seconds: 39,
--                           ticking: true, has_timer: true, time_added,
--                           period_length, counts_from }
--                         En RIKTIG matchklocka med sekunder, inte en
--                         heltalsminut. Det är den enda källan som gör att
--                         appen kan visa samma minut som TV-bilden.
--   include=comments    → löpande matchkommentar ("Tobias Heintz takes a
--                         left-footed shot, but it is blocked."), 7 rader
--                         redan vid minut 17.
--   include=statistics  → 34 typer per lag live, bl.a. Fouls (56),
--                         Free Kicks (55), Offsides (51), Saves (57),
--                         Passes (80), Key Passes (117), Tackles (78),
--                         Duels Won (106), Big Chances Created (580).
--                         Att jämföra med de FYRA vi sparat hittills.
--   include=trends      → samma 34 typer men PER MINUT (258 rader vid
--                         minut 22) — underlaget för momentumgrafen.
--
-- Trender och pressure har redan tabeller sedan Fas 5b/6
-- (fixture_stat_trend, fixture_pressure_index) och återanvänds oförändrade.
-- Den här migrationen lägger bara till det som saknas.
--
-- KÖRS MANUELLT i Supabase SQL Editor, i filnamnsordning (se SETUP.md).
-- Läsande kod är skriven för att tåla att den INTE är körd än — matchhubben
-- faller då tillbaka på Fas 20:s enklare live-vy istället för att krascha.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- fixture_period — matchklockans ankare.
--
-- EN RAD PER HALVLEK (Sportmonks `periods`), inte en per avläsning. Poängen
-- är `started_at` + `ticking`: med en riktig starttidpunkt kan klienten räkna
-- ut sekunden själv mellan två pollningar, istället för att stå still på en
-- minutsiffra tills nästa hämtning. `minutes`/`seconds` är Sportmonks egen
-- senaste avläsning och används som facit varje gång vi pollar, så klientens
-- egen räkning aldrig kan glida iväg.
--
-- `ticking = false` betyder att klockan står (halvtid, avbrott) — då ska UI:t
-- INTE räkna vidare. Det är skillnaden mellan "45:00" som fryst halvtid och
-- "45:00" som en klocka på väg mot tilläggstid.
-- ---------------------------------------------------------------------------
create table public.fixture_period (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  sportmonks_period_id bigint not null,
  type_id integer,
  description text, -- '1st-half' | '2nd-half' | 'extra-time' | 'penalties'
  started_at timestamptz, -- Sportmonks `started` (unix) → klockans ankare
  ended_at timestamptz,
  counts_from integer, -- 0 för första halvlek, 45 för andra
  period_length integer, -- 45 (eller 15 i förlängning)
  time_added integer, -- tilläggstid när domaren signalerat den, annars null
  minutes integer, -- Sportmonks senaste avläsning
  seconds integer,
  ticking boolean not null default false,
  has_timer boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, sportmonks_period_id)
);
create trigger set_fixture_period_updated_at
  before update on public.fixture_period
  for each row execute function public.set_updated_at();
create index fixture_period_fixture_idx on public.fixture_period (fixture_id, sort_order);

-- ---------------------------------------------------------------------------
-- fixture_comment — den löpande matchkommentaren.
--
-- SPRÅK: texten sparas OÖVERSATT på engelska, som Sportmonks levererar den.
-- Det är ett medvetet undantag från projektets svensk-only-regel, uttryckligen
-- beslutat av användaren 2026-08-23 med FotMob som referens (som inte heller
-- översätter sin kommentar i det svenska gränssnittet). Alternativet — att
-- maskinöversätta hundratals meningar per match — hade infört exakt den sorts
-- gissning resten av kodbasen är byggd för att undvika. Ändra inte det här
-- till en "översättning" utan att ta upp det med användaren igen.
--
-- `sortering`: Sportmonks `order` är stigande i tidsordning; UI:t visar
-- nyast först. `is_important`/`is_goal` är källans egna flaggor och används
-- för att lyfta fram rader, aldrig för att räkna mål (det gör event-tabellen).
-- ---------------------------------------------------------------------------
create table public.fixture_comment (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  sportmonks_comment_id bigint not null,
  comment text not null,
  minute integer,
  extra_minute integer,
  is_goal boolean not null default false,
  is_important boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now(),
  unique (fixture_id, sportmonks_comment_id)
);
create index fixture_comment_fixture_idx on public.fixture_comment (fixture_id, sort_order desc);

-- ---------------------------------------------------------------------------
-- fixture_live_team_stat — live-statistik per lag och Sportmonks-typ.
--
-- GENERISK (type_id + värde) istället för 34 namngivna kolumner, av samma
-- skäl som fixture_match_facts är generisk: Sportmonks lägger till typer över
-- tid, och en ny typ ska hamna i databasen även innan vi hunnit bygga UI för
-- den. Namn/grupp slås upp mot `sportmonks_type` (1310 rader) vid läsning.
--
-- Skiljer sig från fixture_team_advanced_stats (som är POST-match, en rad per
-- lag med namngivna kolumner) genom att vara en LÖPANDE, överskrivbar
-- ögonblicksbild under matchen. Efter matchslut tar post-match-importen över
-- och den här tabellen blir historik.
--
-- Ingen FK mot sportmonks_type — en okänd typ får aldrig stoppa en import.
-- ---------------------------------------------------------------------------
create table public.fixture_live_team_stat (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint references public.team (id) on delete set null,
  sportmonks_team_id integer not null,
  type_id integer not null,
  value numeric,
  updated_at timestamptz not null default now(),
  unique (fixture_id, sportmonks_team_id, type_id)
);
create index fixture_live_team_stat_fixture_idx on public.fixture_live_team_stat (fixture_id);

-- ---------------------------------------------------------------------------
-- RLS. Samma hållning som resten av fotbollsdatan (se football_schema): läsning
-- är öppen för inloggade, skrivning sker bara via service-role (importscript
-- och cron-routes), som kringgår RLS.
-- ---------------------------------------------------------------------------
alter table public.fixture_period enable row level security;
alter table public.fixture_comment enable row level security;
alter table public.fixture_live_team_stat enable row level security;

create policy "Public read fixture_period" on public.fixture_period for select using (true);
create policy "Public read fixture_comment" on public.fixture_comment for select using (true);
create policy "Public read fixture_live_team_stat" on public.fixture_live_team_stat for select using (true);
