-- ============================================================================
-- 0002: Fotbollsschema — league, season, team, player, fixture, event, statistics
-- ============================================================================
-- Principer (se PROJEKT_BRIEF.md):
--   1. Säsongs-/liga-agnostiskt: inget hårdkodat mot t.ex. "2026" eller
--      "Allsvenskan" i tabellnamn eller struktur. league/season är egna
--      tabeller så fler ligor/säsonger kan läggas till utan schemaändring.
--   2. Tävlingsuppdelning: statistics och event är alltid kopplade till en
--      specifik league_id (Allsvenskan, cup, europeiskt spel, ...), så
--      get_top_scorers m.fl. kan svara både "totalt" och "bara i Allsvenskan".
--   3. Kvalitativ lagdata (smeknamn, historia, legendarer, troféer) lagras
--      strukturerat i egna fält/tabeller, inte som fritext.

create table public.league (
  id bigserial primary key,
  external_id integer unique, -- API-Football league id, t.ex. 113 för Allsvenskan
  name text not null,
  country text,
  type text, -- 'league' | 'cup' | 'other'
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_league_updated_at
  before update on public.league
  for each row execute function public.set_updated_at();

create table public.season (
  id bigserial primary key,
  league_id bigint not null references public.league (id) on delete cascade,
  year integer not null, -- API-Football säsongsår, t.ex. 2026
  start_date date,
  end_date date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, year)
);
create trigger set_season_updated_at
  before update on public.season
  for each row execute function public.set_updated_at();

create table public.team (
  id bigserial primary key,
  external_id integer unique, -- API-Football team id
  name text not null,
  short_name text,
  logo_url text,
  venue_name text,
  founded_year integer,
  -- Kvalitativ lagdata, strukturerad enligt princip ovan (inte råtext):
  nicknames text[] not null default '{}', -- t.ex. {"Blåvitt","Änglarna"}
  short_history text, -- kort, egen sammanfattning (ej rakt kopierad Wikipedia-text)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_team_updated_at
  before update on public.team
  for each row execute function public.set_updated_at();

-- Låter get_team_facts/matchning slå upp lag via smeknamn ("Blåvitt" -> IFK Göteborg).
create index team_nicknames_idx on public.team using gin (nicknames);

create table public.team_trophy (
  id bigserial primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  competition text not null, -- t.ex. "SM-guld", "Svenska Cupen"
  year integer not null,
  created_at timestamptz not null default now()
);
create index team_trophy_team_idx on public.team_trophy (team_id);

create table public.team_legend (
  id bigserial primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  name text not null,
  period text, -- t.ex. "1998–2010"
  role text, -- t.ex. "Anfallare", "Tränare"
  description text,
  created_at timestamptz not null default now()
);
create index team_legend_team_idx on public.team_legend (team_id);

create table public.team_rivalry (
  id bigserial primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  rival_team_id bigint references public.team (id) on delete set null,
  rival_name text, -- fallback om rivalen inte (ännu) finns i databasen
  description text,
  created_at timestamptz not null default now()
);
create index team_rivalry_team_idx on public.team_rivalry (team_id);

create table public.player (
  id bigserial primary key,
  external_id integer unique, -- API-Football player id
  first_name text,
  last_name text,
  full_name text not null,
  birth_date date,
  nationality text,
  position text, -- Goalkeeper | Defender | Midfielder | Attacker
  photo_url text,
  -- Bekvämlighetsfält för "vilket lag spelar hen i nu" — historik per
  -- säsong/tävling ligger i statistics, inte här.
  current_team_id bigint references public.team (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_player_updated_at
  before update on public.player
  for each row execute function public.set_updated_at();

create index player_current_team_idx on public.player (current_team_id);

create table public.fixture (
  id bigserial primary key,
  external_id integer unique, -- API-Football fixture id
  league_id bigint not null references public.league (id) on delete cascade,
  season_id bigint not null references public.season (id) on delete cascade,
  home_team_id bigint not null references public.team (id),
  away_team_id bigint not null references public.team (id),
  round text, -- t.ex. "Regular Season - 15"
  kickoff_at timestamptz not null,
  status text not null default 'NS', -- API-Football statuskoder: NS/1H/HT/2H/FT/PST/...
  home_score integer,
  away_score integer,
  venue_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_fixture_updated_at
  before update on public.fixture
  for each row execute function public.set_updated_at();

create index fixture_league_season_idx on public.fixture (league_id, season_id);
create index fixture_teams_idx on public.fixture (home_team_id, away_team_id);
create index fixture_kickoff_idx on public.fixture (kickoff_at);

create table public.event (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id),
  player_id bigint references public.player (id),
  assist_player_id bigint references public.player (id),
  type text not null, -- 'goal' | 'card' | 'subst' | 'var'
  detail text, -- t.ex. "Normal Goal", "Yellow Card", "Red Card"
  comments text,
  minute integer not null,
  extra_minute integer,
  created_at timestamptz not null default now(),
  -- Förbereder för live-uppdateraren i fas 3 (poll/diff): samma händelse ska
  -- aldrig kunna sparas två gånger. Se PROJEKT_BRIEF.md "Live-uppdaterare".
  unique (fixture_id, player_id, minute, type, detail)
);
create index event_fixture_idx on public.event (fixture_id);
create index event_player_idx on public.event (player_id);

create table public.statistics (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  -- league_id är nyckeln som ger tävlingsuppdelningen: samma spelare får en
  -- egen rad per league_id (Allsvenskan, cup, Europa...), vilket gör att
  -- get_top_scorers kan svara både "totalt" och "bara i Allsvenskan".
  league_id bigint not null references public.league (id) on delete cascade,
  season_id bigint not null references public.season (id) on delete cascade,
  appearances integer not null default 0,
  minutes_played integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  shots_total integer,
  shots_on_target integer,
  rating numeric(3, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, team_id, league_id, season_id)
);
create trigger set_statistics_updated_at
  before update on public.statistics
  for each row execute function public.set_updated_at();

create index statistics_lookup_idx on public.statistics (team_id, league_id, season_id);
create index statistics_player_idx on public.statistics (player_id);

-- ---------------------------------------------------------------------------
-- RLS: all fotbollsdata är offentlig läsdata (visas i appen för alla
-- inloggade användare). Skrivning sker bara server-side med service role-
-- nyckeln (import-script, admin-routes) och kringgår därmed RLS helt —
-- därför finns inga insert/update/delete-policys här.
-- ---------------------------------------------------------------------------
alter table public.league enable row level security;
alter table public.season enable row level security;
alter table public.team enable row level security;
alter table public.team_trophy enable row level security;
alter table public.team_legend enable row level security;
alter table public.team_rivalry enable row level security;
alter table public.player enable row level security;
alter table public.fixture enable row level security;
alter table public.event enable row level security;
alter table public.statistics enable row level security;

create policy "Public read league" on public.league for select using (true);
create policy "Public read season" on public.season for select using (true);
create policy "Public read team" on public.team for select using (true);
create policy "Public read team_trophy" on public.team_trophy for select using (true);
create policy "Public read team_legend" on public.team_legend for select using (true);
create policy "Public read team_rivalry" on public.team_rivalry for select using (true);
create policy "Public read player" on public.player for select using (true);
create policy "Public read fixture" on public.fixture for select using (true);
create policy "Public read event" on public.event for select using (true);
create policy "Public read statistics" on public.statistics for select using (true);
