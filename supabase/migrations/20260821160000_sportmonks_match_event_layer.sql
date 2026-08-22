-- ============================================================================
-- 0019: Sportmonks matchhändelse-/live-lager (Fas 5b, tillagd efter Fas 5)
-- ============================================================================
-- Komplett pre-match/live/post-match-lager: händelsetidslinje, minutstämplad
-- statistikutveckling, väderprognos, och övrig matchmetadata. Additivt —
-- rör inte befintlig `event`/`fixture_team_stats`/API-Football-historik.
--
-- Verifierat LIVE denna session mot riktiga matcher (en med rött kort, en
-- med straff, en RIKTIG framtida match 2026-08-22 Örgryte-Halmstad):
--   - 7 bekräftade event-typer: Goal(14), Own Goal(15), Penalty(16),
--     Substitution(18), Yellowcard(19), Redcard(20), Yellow/Red card(21).
--     Missed Penalty(17)/VAR(10)/VAR Moments(314) finns i typregistret men
--     ej observerade i stickprovet - sparas ändå (samma type_id-drivna
--     lagring hanterar dem utan schemaändring om/när de dyker upp).
--   - `include=trends`: 880 minutstämplade rader för EN match, 38 olika
--     lagstatistik-mått som utvecklas över tid. Fungerar på REDAN
--     AVSLUTADE matcher, inte bara live.
--   - `include=weatherreport`: riktig väderprognos (temperatur/vind/
--     luftfuktighet/molnighet/beskrivning) - ett oväntat fynd.
--   - `include=predictedlineups`: endpoint fungerar (200, rätt nyckel i
--     svaret) men TOM för en match >24h bort - overifierat om den fylls i
--     närmare avspark.
--   - `include=predictions`/`expectedlineups`: BEKRÄFTAT 403, inte i vår
--     prenumeration.
--   - `GET /football/states` (INTE /core/states, som gav 0 träffar): 25
--     riktiga matchstatusar. LIVE-status-id:n (för live-poll-filtret):
--     2 (1:a halvlek), 3 (HT), 4 (Break), 6 (ET), 9 (Straffar),
--     18 (Interrupted), 21 (ET Break), 22 (2:a halvlek), 23 (ET 2:a halvlek),
--     25 (Pen Break). Slutgiltiga: 5 (FT), 7 (AET), 8 (FT_PEN).
--
-- VIKTIGT (icke-schemarelaterat men värt att notera här): prenumerationen
-- (Starter + Match Facts Basic Early Bird + Pressure Index & xG) går ut ur
-- trial 2026-09-04 enligt Sportmonks eget subscription-svar.

-- ---------------------------------------------------------------------------
-- Ny sync-flagga för denna kombinerade hämtning (events+trends+weather+
-- metadata hämtas i EN anrop per fixture).
-- ---------------------------------------------------------------------------
alter table public.fixture add column sportmonks_matchdata_synced_at timestamptz;
create index fixture_sportmonks_matchdata_synced_idx on public.fixture (sportmonks_matchdata_synced_at);

-- ---------------------------------------------------------------------------
-- fixture_sportmonks_event — PER MATCH, rik händelsetidslinje. Sida vid
-- sida med befintlig `event`-tabell (API-Football), rör den aldrig.
-- Sparar BÅDE upplösta FK:er (om spelaren/laget är Fas 1/3-mappat) OCH de
-- råa Sportmonks-id:na (så data aldrig går förlorad även utan mappning —
-- en framtida mappning kan backfilla FK:erna senare).
-- ---------------------------------------------------------------------------
create table public.fixture_sportmonks_event (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  sportmonks_event_id bigint not null,
  type_id integer not null,
  sub_type_id integer,
  team_id bigint references public.team (id) on delete set null,
  sportmonks_team_id integer,
  player_id bigint references public.player (id) on delete set null,
  sportmonks_player_id integer,
  related_player_id bigint references public.player (id) on delete set null,
  sportmonks_related_player_id integer,
  player_name text,
  related_player_name text,
  result text, -- löpande ställning vid händelsen, t.ex. "1-0"
  info text,
  addition text, -- läsbar beskrivning, t.ex. "1st Goal"
  minute integer,
  extra_minute integer,
  injured boolean,
  on_bench boolean,
  rescinded boolean, -- VAR-upphävt
  sort_order integer,
  created_at timestamptz not null default now(),
  unique (fixture_id, sportmonks_event_id)
);
create index fixture_sportmonks_event_fixture_idx on public.fixture_sportmonks_event (fixture_id, minute);
create index fixture_sportmonks_event_type_idx on public.fixture_sportmonks_event (type_id);

-- ---------------------------------------------------------------------------
-- fixture_stat_trend — minutstämplad lagstatistik-utveckling. STOR TABELL
-- MEDVETET: ~880 rader/match x 615 matcher (2024-2026) ≈ 540 000 rader vid
-- full backfill (användarens egen avvägning: värdet av matchutvecklings-
-- analys väger tyngre än radantalet, Postgres hanterar det utan problem).
-- Delete+insert per fixture vid varje synk (inte append-only) — en ny
-- hämtning representerar Sportmonks fullständiga aktuella vy, inte en
-- ytterligare avläsning att lägga till.
-- ---------------------------------------------------------------------------
create table public.fixture_stat_trend (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint references public.team (id) on delete set null,
  sportmonks_team_id integer,
  type_id integer not null,
  minute integer not null,
  value numeric,
  created_at timestamptz not null default now()
);
create index fixture_stat_trend_fixture_idx on public.fixture_stat_trend (fixture_id, type_id, minute);

-- ---------------------------------------------------------------------------
-- fixture_weather — en rad per match. Uppdateras (upsert) om en ny
-- väderhämtning görs närmare avspark (forecast -> mer exakt forecast).
-- ---------------------------------------------------------------------------
create table public.fixture_weather (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade unique,
  sportmonks_weather_id bigint,
  temperature_day numeric,
  temperature_morning numeric,
  temperature_evening numeric,
  temperature_night numeric,
  feels_like_day numeric,
  wind_speed numeric,
  wind_direction integer,
  humidity_pct integer,
  pressure numeric,
  clouds_pct integer,
  description text,
  report_type text, -- 'forecast' | 'current' m.fl.
  raw jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id)
);
create trigger set_fixture_weather_updated_at
  before update on public.fixture_weather
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fixture_sportmonks_metadata — generisk type_id+jsonb-fångst för allt
-- annat pre-/post-match-fält (formation-innan-bekräftelse, lineup-
-- confirmed, social-hashtag, extra_time-flagga, publiksiffra,
-- matchtröjefärger m.m.) — samma flexibla mönster som fixture_match_facts,
-- så nya fält aldrig kastas bort även om vi inte vet vad de betyder än.
-- ---------------------------------------------------------------------------
create table public.fixture_sportmonks_metadata (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  type_id integer not null,
  value_type text,
  values jsonb not null,
  created_at timestamptz not null default now(),
  unique (fixture_id, type_id)
);
create index fixture_sportmonks_metadata_fixture_idx on public.fixture_sportmonks_metadata (fixture_id);

-- ---------------------------------------------------------------------------
-- RLS: samma princip som all annan fotbollsdata.
-- ---------------------------------------------------------------------------
alter table public.fixture_sportmonks_event enable row level security;
alter table public.fixture_stat_trend enable row level security;
alter table public.fixture_weather enable row level security;
alter table public.fixture_sportmonks_metadata enable row level security;

create policy "Public read fixture_sportmonks_event" on public.fixture_sportmonks_event for select using (true);
create policy "Public read fixture_stat_trend" on public.fixture_stat_trend for select using (true);
create policy "Public read fixture_weather" on public.fixture_weather for select using (true);
create policy "Public read fixture_sportmonks_metadata" on public.fixture_sportmonks_metadata for select using (true);
