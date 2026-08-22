-- ============================================================================
-- Fas 18 (2026-08-22): karriärresan — varje enskilt klubbyte, inte bara det
-- senaste
-- ============================================================================
-- Kompletterar player_career_stint (migration 20260822140000): den tabellen
-- ger PER-SÄSONGS-statistik per klubb, men inte SJÄLVA övergångshändelsen
-- (datum/typ/summa) mellan två klubbar. api-football:s /transfers ger en
-- FULL lista övergångar per spelare (redan hämtad av
-- scripts/import/import-player-career.ts för att räkna fram
-- player.latest_transfer_*-fälten) — den här tabellen sparar ALLA raderna,
-- inte bara den senaste, så "Lämnade Allsvenskan"-milstolpen i karriärresan
-- kan visa RÄTT övergångs typ/summa (t.ex. "Övergång: €2,5M"), inte bara
-- senaste kända klubbyte.

create table public.player_transfer_event (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  transfer_date date not null,
  from_team_name text,
  from_team_external_id integer,
  from_team_logo_url text,
  to_team_name text not null,
  to_team_external_id integer,
  to_team_logo_url text,
  -- rå sträng från api-football ("Free"/"Loan"/"€ 1.5M"/"N/A") — aldrig en egen uppskattning
  transfer_type text,
  created_at timestamptz not null default now(),
  unique (player_id, transfer_date, to_team_external_id)
);

create index player_transfer_event_player_id_idx on public.player_transfer_event (player_id);

alter table public.player_transfer_event enable row level security;
create policy "Public read player_transfer_event" on public.player_transfer_event for select using (true);
