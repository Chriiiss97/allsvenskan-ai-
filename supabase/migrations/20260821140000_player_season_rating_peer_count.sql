-- ============================================================================
-- player_season_rating: peer_count (Scout Engine Fas 8, prestanda)
-- ============================================================================
-- Sista biten som saknades för att rekonstruera en fullständig
-- PlayerRating/GoalkeeperRating-confidence-struktur ur bara det sparade
-- facit, utan en levande fixture_player_stats-omräkning: antal peers
-- (andra spelare på samma position/säsong) som confidence-bedömningen
-- byggde på. Redan beräknat vid varje refresh-ratings.ts-körning
-- (confidence.peerCount) — bara inte sparat förrän nu.
alter table public.player_season_rating
  add column peer_count integer;
