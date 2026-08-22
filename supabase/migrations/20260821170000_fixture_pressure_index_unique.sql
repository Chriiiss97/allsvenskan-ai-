-- ============================================================================
-- 0020: fixture_pressure_index — grain bekräftad, lägg till unique-constraint
-- ============================================================================
-- Fas 6-verifiering (skarp körning, 615 matcher, 115 268 rader): NOLL
-- (fixture_id, team_id, minute)-kombinationer med fler än en rad, kontrollerat
-- över ett stickprov och konsekvent i hela datasetet. Grain är alltså
-- bekräftat exakt (fixture_id, team_id, minute) — lägger till constraint:en
-- som Fas 0-migrationen medvetet lämnade öppen tills detta var verifierat.

alter table public.fixture_pressure_index
  add constraint fixture_pressure_index_unique unique (fixture_id, team_id, minute);
