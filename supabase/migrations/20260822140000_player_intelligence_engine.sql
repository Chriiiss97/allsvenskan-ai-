-- ============================================================================
-- Player Intelligence Engine — shadow-mode state + historik (2026-08-22)
-- ============================================================================
-- Prototypen/backtestet gjordes i research/player-intelligence-engine
-- (scripts/research/player-intelligence-*.ts, PR #1) och rekommenderade ett
-- Kalmanfilter med positionsspecifik brusnivå. Det här är PERSISTENSLAGRET
-- för produktionsversionen av den motorn — körs i SHADOW MODE, vid sidan av
-- den befintliga, oförändrade player_season_rating (dagens OVR). Ingen
-- skyddad fil rörd, ingen befintlig tabell ändrad.
--
-- Två tabeller, medvetet separerade (samma "senaste facit" vs "append-only
-- historik"-princip som redan etablerad i standings/fixture_live_snapshots):
--
--   player_intelligence_state — EN rad per spelare, senaste Kalman-state
--   (mean/varians) — det motorn faktiskt behöver läsa för att kunna
--   uppdatera vid NÄSTA match, samt det Scout/UI skulle visa "just nu".
--
--   player_intelligence_history — EN rad per match som faktiskt körts genom
--   motorn, append-only, sparar state FÖRE och EFTER varje uppdatering plus
--   den observerade Performance-siffran — grunden för en framtida OVR-
--   utvecklingsgraf, och det som gör "varför hade spelaren OVR 68 den här
--   dagen?" svarbart i efterhand (modellversionering, rapportens punkt P).
--
-- OVR/uncertainty sparas som numeric (INTE integer/rounded) — Kalman-
-- uppdateringen är sekventiell och skulle ackumulera avrundningsfel om
-- staten avrundades mellan varje match. Avrundning sker bara vid VISNING.

create table public.player_intelligence_state (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  -- Samma fyra grupper som redan etablerat i lib/football/position-group.ts
  -- — INTE en ny positionsindelning. Kan i teorin skifta över en lång
  -- karriär (extremt sällsynt) — då vinner senaste matchens grupp, samma
  -- "senaste vinner"-princip som redan finns på annat håll i projektet.
  position_group text not null check (position_group in ('goalkeeper', 'defender', 'midfielder', 'attacker')),
  ovr numeric not null,
  uncertainty_sd numeric not null,
  last_fixture_id bigint references public.fixture (id) on delete set null,
  last_kickoff_at timestamptz,
  -- Antal matcher motorn FAKTISKT kunnat uppdatera på (dvs. hade ett giltigt
  -- Performance-värde) — skiljer sig från spelarens totala matchantal om
  -- vissa tidiga matcher saknade en kausal peer-pool (<4 peers ännu).
  observation_count integer not null default 0,
  model_version text not null,
  updated_at timestamptz not null default now(),
  unique (player_id)
);

create table public.player_intelligence_history (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  position_group text not null check (position_group in ('goalkeeper', 'defender', 'midfielder', 'attacker')),
  kickoff_at timestamptz not null,
  minutes_played integer not null,
  -- null om matchens kausala peer-pool var för liten (<4 peers) — samma
  -- regel som redan i forskningsprototypen, ingen gissning på ett värde.
  performance numeric,
  ovr_before numeric not null,
  uncertainty_before numeric not null,
  ovr_after numeric not null,
  uncertainty_after numeric not null,
  -- Dagar sedan förra observerade matchen (över säsongsuppehåll/skada/etc.)
  -- — null för spelarens allra första motor-uppdatering.
  days_since_last numeric,
  -- Diagnostiskt lager (rapportens punkt O) — flaggar men ändrar ALDRIG
  -- resultatet. anomaly_reason är fritext, t.ex. "|Δ|=23.4 > 2×σ_position".
  anomaly_flag boolean not null default false,
  anomaly_reason text,
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (player_id, fixture_id)
);

create index player_intelligence_state_player_idx on public.player_intelligence_state (player_id);
create index player_intelligence_history_player_idx on public.player_intelligence_history (player_id, kickoff_at);
create index player_intelligence_history_fixture_idx on public.player_intelligence_history (fixture_id);
create index player_intelligence_history_anomaly_idx on public.player_intelligence_history (anomaly_flag) where anomaly_flag = true;

alter table public.player_intelligence_state enable row level security;
alter table public.player_intelligence_history enable row level security;

-- Samma princip som all annan fotbollsdata: offentlig läsning, skrivs bara
-- server-side med service role-nyckeln (kringgår RLS) via
-- scripts/import/run-player-intelligence-engine.ts.
create policy "Public read player_intelligence_state" on public.player_intelligence_state for select using (true);
create policy "Public read player_intelligence_history" on public.player_intelligence_history for select using (true);
