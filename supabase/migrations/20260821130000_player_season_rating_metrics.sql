-- ============================================================================
-- player_season_rating: sparade mått-percentiler (Scout Engine, 2026-08-21)
-- ============================================================================
-- Fas 2 av Scout Engine-arbetet. player_season_rating hade hittills bara
-- slutgiltig OVR + konfidens — varje gång Scout skulle fråga "vilka spelare
-- ligger över 80:e percentilen på dribblingar?" hade det krävt en ny,
-- kostsam liga-bred omräkning från fixture_player_stats. Dessa två kolumner
-- sparar det redan beräknade mellansteget (kategori-poäng + per-mått
-- percentil+råvärde) EN gång per uppdatering, så Scout/arketyper/
-- percentilfilter kan läsa direkt istället för att räkna om.
--
-- category_scores: bara för utespelare (shooting/passing/dribbling/
-- defending — samma fyra som redan bygger OVR, se position-rating-config.ts).
-- null för målvakter (målvaktsmodellen har inga kategorier, bara tre
-- fristående mått, se metric_values istället).
--
-- metric_values: {[mättnyckel]: {value, percentile}} — TÄCKER BÅDE de mått
-- som redan bygger OVR (samma percentiler som redan beräknas idag, bara nu
-- SPARADE istället för kastade) OCH nya, fristående Scout-mått som
-- INTE påverkar OVR (t.ex. "dribblesPastPer90" — se
-- lib/football/rating/scout-metrics.ts). Att lägga till ett nytt mått här
-- ändrar alltså ALDRIG en redan skeppad OVR-siffra.
alter table public.player_season_rating
  add column category_scores jsonb,
  add column metric_values jsonb;
