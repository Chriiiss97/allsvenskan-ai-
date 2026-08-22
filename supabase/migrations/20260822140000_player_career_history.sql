-- ============================================================================
-- Fas 17 (2026-08-22): Spelarens fulla dokumenterade karriär + troféer
-- ============================================================================
-- Byggd EFTER ett riktigt testanrop mot api-football (bekräftat i steg 1,
-- se scripts/research-loggen denna session): /transfers?player=X ger riktiga
-- klubbyten (namn/datum/typ, inkl. utländska klubbar), /players?id=X&team=T
-- &season=Y ger riktig per-klubb-per-säsong-statistik (matcher/mål/assist/
-- minuter/kort/betyg) för VILKEN liga som helst — inte bara Allsvenskan —
-- och /trophies?player=X ger riktig trofédata. INGET av detta är gissat.
--
-- Medvetet TVÅ NYA, separata tabeller — rör INTE `statistics` (Allsvenskans
-- egen, redan verifierade käll-tabell för OVR/DNA/rating, som förblir
-- källan för Allsvenska säsonger i UI:t). player_career_stint täcker bara
-- det `statistics` INTE redan har: utländska ligor, lägre svenska divisioner,
-- cupspel — importskriptet hoppar uttryckligen över Allsvenskan-ligan
-- (api-football league_id=113) för att aldrig duplicera/motsäga den redan
-- etablerade Allsvenska statistiken.

create table public.player_trophy (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  league_name text not null,
  country text,
  season text not null, -- rå sträng från api-football, t.ex. "2019/2020" eller "2015"
  place text not null, -- rå sträng från api-football, t.ex. "Winner"/"2nd Place" — aldrig egen tolkning
  created_at timestamptz not null default now(),
  unique (player_id, league_name, season, place)
);

create table public.player_career_stint (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  team_name text not null,
  team_logo_url text,
  team_external_id integer,
  league_name text not null,
  league_country text,
  league_logo_url text,
  league_external_id integer not null,
  season_year integer not null,
  appearances integer,
  lineups integer,
  minutes_played integer,
  goals integer,
  assists integer,
  yellow_cards integer,
  red_cards integer,
  -- api-football ger betyg som sträng ("6.800000") för vissa ligor/spelare,
  -- null för andra — aldrig 0 som gissning när det saknas.
  rating numeric,
  created_at timestamptz not null default now(),
  unique (player_id, team_external_id, league_external_id, season_year)
);

create index player_trophy_player_id_idx on public.player_trophy (player_id);
create index player_career_stint_player_id_idx on public.player_career_stint (player_id);

-- Avstämningsflagga (samma mönster som fixture.sportmonks_match_facts_synced_at)
-- — importskriptet kör bara spelare med career_synced_at IS NULL, så en
-- avbruten körning kan återupptas utan att börja om.
alter table public.player add column career_synced_at timestamptz;

-- Fas 17b — "har spelaren redan lämnat den klubb vi tror hen spelar för?".
-- player.current_team_id sätts BARA av den periodiska Allsvenska
-- roster-importen (scripts/import/import-players.ts) och känner alltså
-- inte av en mitt-i-säsongen-övergång till en klubb UTANFÖR Allsvenskan
-- (t.ex. till en utländsk liga) — bekräftat verkligt fall: en spelare vars
-- current_team_id fortfarande pekar på ett Allsvenskt lag trots att han
-- redan spelar för en klubb i Spanien. /transfers-anropet importskriptet
-- redan gör för karriärhistoriken (ovan) ger oss senaste klubbytet GRATIS
-- (ingen extra API-kostnad) — sparas här så UI:t kan flagga "har lämnat"
-- genom att jämföra mot current_team_id, ALDRIG genom att skriva över
-- current_team_id självt (andra sidor, t.ex. lagtruppen, förlitar sig på
-- att det fältet betyder "registrerad Allsvensk trupp", inte "spelar där
-- just nu").
alter table public.player add column latest_transfer_date date;
alter table public.player add column latest_transfer_team_name text;
alter table public.player add column latest_transfer_team_logo_url text;
alter table public.player add column latest_transfer_team_external_id integer;

alter table public.player_trophy enable row level security;
alter table public.player_career_stint enable row level security;

create policy "Public read player_trophy" on public.player_trophy for select using (true);
create policy "Public read player_career_stint" on public.player_career_stint for select using (true);
