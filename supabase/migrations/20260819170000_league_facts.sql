-- ============================================================================
-- 0008: liganivåfakta — league.founded_year/short_history + league_fact
-- ============================================================================
-- Samma princip som lagfaktan (migration 0002/0004): strukturerad, inte
-- fritext. league_fact är medvetet generisk (label/description/year) istället
-- för separata kolumner per rekordtyp, eftersom liga-rekord är en mer
-- heterogen samling (målrekord, publikrekord, SM-guld-rekord, ...) än lagens
-- troféer/legendarer som har ett tydligt gemensamt format.

alter table public.league
  add column founded_year integer,
  add column short_history text;

create table public.league_fact (
  id bigserial primary key,
  league_id bigint not null references public.league (id) on delete cascade,
  label text not null,        -- t.ex. "Flest SM-guld", "Målrekord i en säsong"
  description text not null,
  year integer,               -- valfritt årtal kopplat till rekordet/faktan
  created_at timestamptz not null default now()
);

create index league_fact_league_idx on public.league_fact (league_id);

alter table public.league_fact enable row level security;

create policy "Public read league_fact" on public.league_fact for select using (true);
