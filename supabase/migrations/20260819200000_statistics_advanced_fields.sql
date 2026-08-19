-- ============================================================================
-- 0011: statistics — avancerade säsongsfält (Data-sektion, del 1)
-- ============================================================================
-- API-Football:s /players-endpoint (redan använd i scripts/import/import-
-- players.ts) returnerar dessa fält i sitt svar, men import-scriptet har
-- hittills bara sparat en delmängd (mål/assist/kort/skott/appearances).
-- Ingen ny API-koppling behövs — bara fler kolumner + att faktiskt spara
-- det vi redan hämtar. Se plan: Data-sektion del 1.
--
-- Alla nullable: vissa fält (särskilt passes_accuracy, dribbles.past) är
-- ofta null i källdatan även för spelare med mycket speltid — en täcknings-
-- lucka i Allsvenskan-datan, inte ett importfel. UI:t ska visa "ej
-- tillgängligt" för null, aldrig 0.

alter table public.statistics
  add column passes_total integer,
  add column passes_key integer,
  add column passes_accuracy integer,
  add column tackles_total integer,
  add column tackles_blocks integer,
  add column tackles_interceptions integer,
  add column duels_total integer,
  add column duels_won integer,
  add column dribbles_attempts integer,
  add column dribbles_success integer,
  add column fouls_drawn integer,
  add column fouls_committed integer;
