-- ============================================================================
-- 0014: Matchdjup-schema (Ultra-plan, steg 2 av 10-stegsplanen)
-- ============================================================================
-- Bygger ut schemat för match-nivå-granularitet istället för bara säsongs-
-- summeringar (dagens `statistics`-tabell). Fältnamnen här är INTE gissade —
-- de är tagna direkt ur riktiga testanrop mot API-Football (steg 1, körd mot
-- en verklig avslutad match: AIK–Halmstad 2024-11-10, fixture external_id
-- 1164312). Se planen ("Allsvenskan Datalager") för den fullständiga
-- verifieringsrapporten.
--
-- Fyra lager, som i planen: RAW (api_raw_response) -> CANONICAL (tabellerna
-- nedan) -> DERIVED (byggs i ett senare steg, ren beräkning) -> PRODUCT
-- (Player/Team/Match DNA).
--
-- Två konkreta fynd från steg 1 som styr designen här:
--   1. `fixtures/events` innehåller INGA koordinater (x/y, shot type) — vi
--      bygger alltså inga kolumner för spatial data, det skulle bara vara
--      dött utrymme.
--   2. `fixtures/statistics` innehåller ett RIKTIGT `expected_goals`-fält per
--      lag och match (och `goals_prevented` för målvakter) — oväntat, men
--      bekräftat. Sparas i fixture_team_stats.

-- ---------------------------------------------------------------------------
-- venue — arena som egen entitet (var tidigare bara fritext på team/fixture)
-- ---------------------------------------------------------------------------
create table public.venue (
  id bigserial primary key,
  external_id integer unique, -- API-Football venue id
  name text not null,
  address text,
  city text,
  country text,
  capacity integer,
  surface text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_venue_updated_at
  before update on public.venue
  for each row execute function public.set_updated_at();

-- Additiv: befintliga venue_name-textfält på team/fixture rörs inte (allt
-- läsande kod som redan använder dem fortsätter fungera oförändrat).
alter table public.team add column venue_id bigint references public.venue (id) on delete set null;
alter table public.fixture add column venue_id bigint references public.venue (id) on delete set null;

-- ---------------------------------------------------------------------------
-- coach
-- ---------------------------------------------------------------------------
-- OBS (bekräftat i steg 1): API-Football gav två separata /coachs-poster med
-- olika external_id för vad som ser ut att vara SAMMA verkliga tränare (en
-- rik post, en nästan tom). Ingen databasconstraint kan lösa det pålitligt —
-- import-koden i ett senare steg måste aktivt deduplicera (t.ex. genom att
-- föredra den post som har flest ifyllda fält för ett givet lag), inte anta
-- att external_id är en stabil 1:1-nyckel mot en verklig person.
create table public.coach (
  id bigserial primary key,
  external_id integer unique,
  full_name text not null,
  nationality text,
  birth_date date,
  photo_url text,
  current_team_id bigint references public.team (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_coach_updated_at
  before update on public.coach
  for each row execute function public.set_updated_at();
create index coach_current_team_idx on public.coach (current_team_id);

-- ---------------------------------------------------------------------------
-- referee — medvetet tunn: API-Football ger BARA en namnsträng på fixture
-- (`fixture.referee`), ingen egen domar-endpoint, inget externt ID att
-- deduplicera mot. Matchas alltså på exakt namn tills vidare — en känd
-- svaghet (samma domare kan i teorin stavas olika mellan matcher), inte ett
-- antagande vi gör oss blinda för.
-- ---------------------------------------------------------------------------
create table public.referee (
  id bigserial primary key,
  full_name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.fixture add column referee_id bigint references public.referee (id) on delete set null;

-- ---------------------------------------------------------------------------
-- fixture_lineup / fixture_lineup_player — formation, startelva, avbytare
-- ---------------------------------------------------------------------------
create table public.fixture_lineup (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  coach_id bigint references public.coach (id) on delete set null,
  formation text, -- t.ex. "4-2-3-1"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);
create trigger set_fixture_lineup_updated_at
  before update on public.fixture_lineup
  for each row execute function public.set_updated_at();

create table public.fixture_lineup_player (
  id bigserial primary key,
  fixture_lineup_id bigint not null references public.fixture_lineup (id) on delete cascade,
  player_id bigint references public.player (id) on delete set null,
  is_starter boolean not null,
  shirt_number integer,
  position text, -- G/D/M/F från API:t
  grid text, -- rad:kolumn i formationen, t.ex. "2:1" — riktig sub-positionsdata
  created_at timestamptz not null default now(),
  unique (fixture_lineup_id, player_id)
);
create index fixture_lineup_player_lineup_idx on public.fixture_lineup_player (fixture_lineup_id);
create index fixture_lineup_player_player_idx on public.fixture_lineup_player (player_id);

-- ---------------------------------------------------------------------------
-- fixture_player_stats — PER-MATCH spelarstatistik, skild från dagens
-- säsongsaggregerade `statistics`-tabell. Fälten är exakt vad steg 1 såg i
-- ett riktigt /fixtures/players-svar (inkl. games.captain/substitute,
-- målvaktsfält, full straffstatistik — allt bekräftat verkligt).
-- ---------------------------------------------------------------------------
create table public.fixture_player_stats (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  player_id bigint references public.player (id) on delete set null,
  minutes_played integer,
  position text,
  shirt_number integer,
  rating numeric(3, 1),
  is_captain boolean,
  is_substitute boolean,
  shots_total integer,
  shots_on_target integer,
  goals integer,
  goals_conceded integer, -- målvakter
  assists integer,
  saves integer, -- målvakter — verifierat i steg 1 att matcha lagstatistikens summa exakt
  passes_total integer,
  passes_key integer,
  passes_accuracy integer,
  tackles_total integer,
  tackles_blocks integer,
  tackles_interceptions integer,
  duels_total integer,
  duels_won integer,
  dribbles_attempts integer,
  dribbles_success integer,
  dribbles_past integer,
  fouls_drawn integer,
  fouls_committed integer,
  offsides integer,
  yellow_cards integer,
  red_cards integer,
  penalty_won integer,
  penalty_committed integer,
  penalty_scored integer,
  penalty_missed integer,
  penalty_saved integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, player_id)
);
create trigger set_fixture_player_stats_updated_at
  before update on public.fixture_player_stats
  for each row execute function public.set_updated_at();
create index fixture_player_stats_fixture_idx on public.fixture_player_stats (fixture_id);
create index fixture_player_stats_player_idx on public.fixture_player_stats (player_id);

-- ---------------------------------------------------------------------------
-- fixture_team_stats — PER-MATCH lagstatistik, slutgiltiga värden.
-- expected_goals/goals_prevented bekräftade i steg 1 — ett oväntat fynd som
-- ändrade flera "ej möjligt"-bedömningar i analysmotor-planen till "rådata".
-- ---------------------------------------------------------------------------
create table public.fixture_team_stats (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  shots_on_goal integer,
  shots_off_goal integer,
  shots_total integer,
  shots_blocked integer,
  shots_inside_box integer,
  shots_outside_box integer,
  fouls integer,
  corners integer,
  offsides integer,
  possession_pct integer, -- "64%" -> 64
  yellow_cards integer,
  red_cards integer,
  goalkeeper_saves integer,
  passes_total integer,
  passes_accurate integer,
  passes_pct integer,
  expected_goals numeric(4, 2),
  goals_prevented numeric(4, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);
create trigger set_fixture_team_stats_updated_at
  before update on public.fixture_team_stats
  for each row execute function public.set_updated_at();
create index fixture_team_stats_fixture_idx on public.fixture_team_stats (fixture_id);

-- ---------------------------------------------------------------------------
-- fixture_live_snapshots — tidsserie under en pågående match, en rad per
-- avläsning (ALDRIG en överskriven rad). Bekräftat nödvändig i steg 1:
-- /fixtures/statistics är en tidsstämpellös ögonblicksbild, API:t sparar
-- ingen egen historik åt oss. Grunden för Match DNA:s momentum-analys — men
-- bara FRAMÅT I TIDEN, kan aldrig fyllas i retroaktivt för redan spelade
-- matcher (se planens avsnitt 4).
-- ---------------------------------------------------------------------------
create table public.fixture_live_snapshots (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  captured_at timestamptz not null default now(),
  match_minute integer,
  home_score integer,
  away_score integer,
  home_possession_pct integer,
  away_possession_pct integer,
  home_shots_total integer,
  away_shots_total integer,
  home_shots_on_target integer,
  away_shots_on_target integer,
  home_corners integer,
  away_corners integer,
  created_at timestamptz not null default now()
);
create index fixture_live_snapshots_fixture_idx on public.fixture_live_snapshots (fixture_id, captured_at);

-- ---------------------------------------------------------------------------
-- player_injury — täcker BÅDA formerna steg 1 bekräftade som olika:
--   kind='sidelined'  -> rent datumintervall (typ/start/slut), från /sidelined
--   kind='matchstatus' -> knuten till en specifik match ("Questionable"/"Out"
--                         inför den matchen), från /injuries
-- ---------------------------------------------------------------------------
create table public.player_injury (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  kind text not null check (kind in ('sidelined', 'matchstatus')),
  type text, -- t.ex. "Knee Injury", "Questionable"
  reason text, -- bara matchstatus, t.ex. "Injury"
  start_date date, -- bara sidelined
  end_date date, -- bara sidelined
  fixture_id bigint references public.fixture (id) on delete set null, -- bara matchstatus
  created_at timestamptz not null default now()
);
create index player_injury_player_idx on public.player_injury (player_id);

-- ---------------------------------------------------------------------------
-- standings — append-only snapshot (som fixture_live_snapshots, inte en
-- upsert-per-lag-tabell): varje hämtning lägger till nya rader så vi kan
-- visa tabellposition över tid, inte bara nuläget.
-- ---------------------------------------------------------------------------
create table public.standings (
  id bigserial primary key,
  season_id bigint not null references public.season (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  round text, -- API:s omgångsetikett vid hämtningstillfället
  rank integer not null,
  points integer not null,
  goals_diff integer,
  played integer,
  win integer,
  draw integer,
  lose integer,
  goals_for integer,
  goals_against integer,
  home_played integer,
  home_win integer,
  home_draw integer,
  home_lose integer,
  home_goals_for integer,
  home_goals_against integer,
  away_played integer,
  away_win integer,
  away_draw integer,
  away_lose integer,
  away_goals_for integer,
  away_goals_against integer,
  form text, -- t.ex. "WLWWL"
  captured_at timestamptz not null default now()
);
create index standings_season_team_idx on public.standings (season_id, team_id, captured_at);

-- ---------------------------------------------------------------------------
-- api_raw_response — RAW-lagret. Begränsat till de matchnära, DYRA
-- endpointen (events/lineups/statistics/player-stats) där ett omhämtning
-- senare faktiskt skulle kosta calls — inte för billiga endpoints som
-- standings/teams som är triviala att hämta om.
-- ---------------------------------------------------------------------------
create table public.api_raw_response (
  id bigserial primary key,
  endpoint text not null, -- t.ex. '/fixtures/events'
  params jsonb not null,
  fixture_id bigint references public.fixture (id) on delete cascade,
  response jsonb not null,
  fetched_at timestamptz not null default now()
);
create index api_raw_response_fixture_idx on public.api_raw_response (fixture_id);
create index api_raw_response_endpoint_idx on public.api_raw_response (endpoint);

-- ---------------------------------------------------------------------------
-- ingestion_log — drift, inte fotbollsdata. En rad per körning/batch: grunden
-- för calls-budget-vyn (steg 10) och för att kunna återhämta sig efter ett
-- misslyckat anrop utan att gissa vad som redan hann köras.
-- ---------------------------------------------------------------------------
create table public.ingestion_log (
  id bigserial primary key,
  job_name text not null, -- t.ex. 'import-lineups', 'live-poll'
  endpoint text not null,
  params jsonb,
  calls_used integer not null default 1,
  rows_written integer not null default 0,
  status text not null default 'success' check (status in ('success', 'error', 'partial')),
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index ingestion_log_started_idx on public.ingestion_log (started_at);

-- ---------------------------------------------------------------------------
-- Fler sync-flaggor på fixture — samma etablerade mönster som
-- events_synced_at (0004), en kolumn per resurstyp så en avbruten batch kan
-- återupptas utan att hämta om det som redan är klart.
-- ---------------------------------------------------------------------------
alter table public.fixture
  add column lineups_synced_at timestamptz,
  add column statistics_synced_at timestamptz,
  add column player_stats_synced_at timestamptz;

create index fixture_lineups_synced_idx on public.fixture (lineups_synced_at);
create index fixture_statistics_synced_idx on public.fixture (statistics_synced_at);
create index fixture_player_stats_synced_idx on public.fixture (player_stats_synced_at);

-- ---------------------------------------------------------------------------
-- RLS: samma princip som all annan fotbollsdata — offentlig läsning, skrivs
-- bara server-side med service role-nyckeln (kringgår RLS helt).
-- ingestion_log och api_raw_response är drift/diagnostik, inte produktdata —
-- INGEN publik läspolicy för dem, bara service-role (default när RLS är på
-- utan policies).
-- ---------------------------------------------------------------------------
alter table public.venue enable row level security;
alter table public.coach enable row level security;
alter table public.referee enable row level security;
alter table public.fixture_lineup enable row level security;
alter table public.fixture_lineup_player enable row level security;
alter table public.fixture_player_stats enable row level security;
alter table public.fixture_team_stats enable row level security;
alter table public.fixture_live_snapshots enable row level security;
alter table public.player_injury enable row level security;
alter table public.standings enable row level security;
alter table public.api_raw_response enable row level security;
alter table public.ingestion_log enable row level security;

create policy "Public read venue" on public.venue for select using (true);
create policy "Public read coach" on public.coach for select using (true);
create policy "Public read referee" on public.referee for select using (true);
create policy "Public read fixture_lineup" on public.fixture_lineup for select using (true);
create policy "Public read fixture_lineup_player" on public.fixture_lineup_player for select using (true);
create policy "Public read fixture_player_stats" on public.fixture_player_stats for select using (true);
create policy "Public read fixture_team_stats" on public.fixture_team_stats for select using (true);
create policy "Public read fixture_live_snapshots" on public.fixture_live_snapshots for select using (true);
create policy "Public read player_injury" on public.player_injury for select using (true);
create policy "Public read standings" on public.standings for select using (true);
-- api_raw_response och ingestion_log: medvetet inga publika policys (interna, service-role-only).
