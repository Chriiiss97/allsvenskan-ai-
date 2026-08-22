-- ============================================================================
-- 0018: Sportmonks-grund (Sportmonks-integration, Fas 0 av 15-fasplanen)
-- ============================================================================
-- Lägger grunden för Sportmonks som en KOMPLETTERANDE datakälla vid sidan om
-- API-Football, enligt samma fyra-lager-princip som redan etablerad i
-- 20260820120000 (RAW -> CANONICAL -> DERIVED -> PRODUCT). Ingen befintlig
-- tabells skrivform ändras — allt här är additivt.
--
-- Verifierat LIVE denna session mot tre riktiga Allsvenska matcher
-- (2024/2025/2026) med projektets faktiska Sportmonks-nyckel (Starter +
-- Pressure Index & xG + Match Facts Basic Early Bird), INTE gissat:
--   - Sportmonks har BARA Allsvenskan-data för 2024, 2025, 2026 (ingen
--     historik bakåt till 2016 — 2016-2023 fortsätter alltså vila helt på
--     API-Football, oförändrat).
--   - Spelarnivå-xG/xGoT, en 11-delad xG-familj på lagnivå, Pressure Index
--     (minutupplöst matchmomentum — river den tidigare dokumenterade
--     PERMANENTA begränsningen i DATA_CATALOG.md), Match Facts (H2H-
--     formsviter m.m., men bekräftat 0 poster i 2 av 2 testade 2024-matcher
--     — täckningsluckan stickprovas bredare i Fas 7), samt 33 nya och 4
--     förbättrade per-spelare-mått och 12 nya per-lag-mått.
--   - Tre type_id förblir overifierade (bl.a. 117172, samt "Shooting
--     Performance"s exakta innebörd) — de fångas i raw_types-kolumner nedan,
--     men får INTE konsumeras av analyskod förrän de är verifierade.
--
-- Sportmonks har ett HELT annat id-system än API-Football (type_id-kodat,
-- egna interna entitets-id). Ingen befintlig kolumn kan användas för
-- mappning — sportmonks_id läggs till som en ny, separat identifierare på de
-- tre kanoniska entiteterna. Faktisk mappning (Fas 1-3) skriver ALDRIG denna
-- kolumn förrän en matchning är verifierad — se sportmonks_player_mapping_
-- candidate nedan för den känsligaste av de tre (spelare).

-- ---------------------------------------------------------------------------
-- sportmonks_id på de tre kanoniska entiteterna — nullable tills mappad.
-- ---------------------------------------------------------------------------
alter table public.team add column sportmonks_id integer unique;
alter table public.player add column sportmonks_id integer unique;
alter table public.fixture add column sportmonks_id integer unique;

-- Fyra nya sync-flaggor, samma återupptagningsmönster som redan finns för
-- API-Footballs events_synced_at/lineups_synced_at/statistics_synced_at/
-- player_stats_synced_at (20260819130000 / 20260820120000).
alter table public.fixture
  add column sportmonks_advanced_stats_synced_at timestamptz,
  add column sportmonks_xg_synced_at timestamptz,
  add column sportmonks_pressure_synced_at timestamptz,
  add column sportmonks_match_facts_synced_at timestamptz;

create index fixture_sportmonks_advanced_stats_synced_idx on public.fixture (sportmonks_advanced_stats_synced_at);
create index fixture_sportmonks_xg_synced_idx on public.fixture (sportmonks_xg_synced_at);
create index fixture_sportmonks_pressure_synced_idx on public.fixture (sportmonks_pressure_synced_at);
create index fixture_sportmonks_match_facts_synced_idx on public.fixture (sportmonks_match_facts_synced_at);

-- ---------------------------------------------------------------------------
-- api_raw_response — återanvänder den befintliga RAW-tabellen (20260820120000)
-- istället för en ny. En source-kolumn räcker för att hålla isär de två
-- källorna; formen (endpoint/params/response jsonb) är redan källoberoende.
-- ---------------------------------------------------------------------------
alter table public.api_raw_response add column source text not null default 'api-football';
create index api_raw_response_source_idx on public.api_raw_response (source);

-- ---------------------------------------------------------------------------
-- sportmonks_type — cache av /v3/core/types (~1125+ rader denna session).
-- Sportmonks type_id ANVÄNDS DIREKT som primärnyckel — det är redan en
-- stabil, global identifierare, ett extra surrogat-id skulle bara ge en
-- onödig join-indirektion. raw jsonb fångar hela typobjektet: inte alla
-- fält är förstådda ännu (se overifierade type_id ovan), spara allt, tolka
-- det vi verifierat.
-- ---------------------------------------------------------------------------
create table public.sportmonks_type (
  id integer primary key, -- Sportmonks eget type_id
  name text not null,
  code text,
  stat_group text,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_sportmonks_type_updated_at
  before update on public.sportmonks_type
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sportmonks_player_mapping_candidate — GRANSKNINGSKÖ, inte en direkt
-- skrivväg till player.sportmonks_id. Spelarmatchning är den mest riskabla
-- delen av hela integrationen (fel mappning skulle förorena Rating/DNA med
-- FEL persons statistik) — se Fas 3. player.sportmonks_id sätts BARA från
-- status='approved'-rader, aldrig direkt av något importscript.
-- ---------------------------------------------------------------------------
create table public.sportmonks_player_mapping_candidate (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  sportmonks_player_id integer not null,
  sportmonks_name text not null,
  team_id bigint references public.team (id) on delete set null,
  match_basis text not null check (
    match_basis in ('name_and_dob', 'name_only', 'fuzzy_name_and_dob', 'fuzzy_name', 'manual')
  ),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  score numeric,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (player_id, sportmonks_player_id)
);
create index sportmonks_player_mapping_candidate_status_idx on public.sportmonks_player_mapping_candidate (status);
create index sportmonks_player_mapping_candidate_player_idx on public.sportmonks_player_mapping_candidate (player_id);

-- ---------------------------------------------------------------------------
-- fixture_player_advanced_stats — PER MATCH, Sportmonks-källa. Innehåller
-- BARA de mått som är genuint nya eller mätbart förbättrade jämfört med
-- befintlig fixture_player_stats (se DATA_CATALOG.md för fält-för-fält-
-- jämförelsen) — dubblerar aldrig mål/skott/passningar-VOLYM som redan finns
-- där. Namngivna, typade kolumner för de ~30 väl identifierade måtten
-- (samma breda-tabell-konvention som fixture_player_stats), plus raw_types
-- jsonb som fångar allt overifierat (bl.a. type_id 117172) tills det är
-- tolkat och flyttat till en egen kolumn i en uppföljande migration.
-- ---------------------------------------------------------------------------
create table public.fixture_player_advanced_stats (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  player_id bigint references public.player (id) on delete set null,
  touches integer,
  ball_recovery integer,
  possession_lost integer,
  turnovers integer, -- "Turn Over" (type_id 121) — sett en gång, oklar exakt skillnad mot possession_lost, sparas separat tills utrett
  passes_final_third integer,
  backward_passes integer,
  total_crosses integer,
  accurate_crosses integer,
  successful_crosses_pct numeric(5, 2),
  aerials_total integer,
  aerials_won integer,
  aerials_lost integer,
  aerials_won_pct numeric(5, 2),
  long_balls integer,
  long_balls_won integer,
  long_balls_won_pct numeric(5, 2),
  big_chances_created integer,
  big_chances_missed integer,
  chances_created integer,
  tackles_won integer,
  tackles_won_pct numeric(5, 2),
  duels_won_pct numeric(5, 2), -- Sportmonks egen färdigberäknade %, för jämförelse mot fixture_player_stats.duels_won/duels_total (Fas 5-verifiering)
  passes_accuracy_pct numeric(5, 2), -- Sportmonks-källa, för jämförelse mot fixture_player_stats.passes_accuracy (sparse i vår befintliga data)
  clearances integer,
  clearance_offline integer,
  error_lead_to_shot integer,
  hit_woodwork integer,
  dispossessed integer,
  man_of_match boolean,
  gk_good_high_claim integer,
  gk_saves_insidebox integer,
  gk_punches integer,
  xg numeric(6, 4),
  xgot numeric(6, 4),
  raw_types jsonb not null default '{}'::jsonb, -- overifierade type_id, {type_id: värde} — se filhuvudets kommentar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, player_id)
);
create trigger set_fixture_player_advanced_stats_updated_at
  before update on public.fixture_player_advanced_stats
  for each row execute function public.set_updated_at();
create index fixture_player_advanced_stats_fixture_idx on public.fixture_player_advanced_stats (fixture_id);
create index fixture_player_advanced_stats_player_idx on public.fixture_player_advanced_stats (player_id);

-- ---------------------------------------------------------------------------
-- fixture_team_advanced_stats — PER MATCH, lagnivå. Samma princip som ovan:
-- bara nya/förbättrade mått jämfört med befintlig fixture_team_stats.
-- ---------------------------------------------------------------------------
create table public.fixture_team_advanced_stats (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  attacks integer,
  dangerous_attacks integer,
  ball_safe integer,
  long_passes integer,
  successful_long_passes integer,
  successful_long_passes_pct numeric(5, 2),
  total_crosses integer,
  accurate_crosses integer,
  big_chances_created integer,
  big_chances_missed integer,
  hit_woodwork integer,
  injuries integer, -- löpande skaderäknare från Sportmonks — sett i 1 av 3 testmatcher, ostabil förekomst, dokumenteras i DATA_CATALOG.md
  successful_passes_pct numeric(5, 2), -- Sportmonks-källa, för jämförelse mot fixture_team_stats.passes_pct
  successful_dribbles_pct numeric(5, 2),
  raw_types jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);
create trigger set_fixture_team_advanced_stats_updated_at
  before update on public.fixture_team_advanced_stats
  for each row execute function public.set_updated_at();
create index fixture_team_advanced_stats_fixture_idx on public.fixture_team_advanced_stats (fixture_id);

-- ---------------------------------------------------------------------------
-- fixture_team_xg — xG-familjen, lagnivå. EGEN tabell (inte ihopslagen med
-- fixture_team_advanced_stats) eftersom xG är produktens mest synliga nya
-- data och förtjänar en egen backfill-status (sportmonks_xg_synced_at).
-- Ligger sida vid sida med — ersätter INTE — befintlig
-- fixture_team_stats.expected_goals/goals_prevented (Fas 4 jämför dem).
-- xg_penalties/xg_difference observerades ALDRIG i denna sessions tre
-- testmatcher (inga straffar inträffade) — kolumnerna finns med (type_id
-- 7940/9684 syns i typregistret) men kan visa sig permanent tomma; Fas 4
-- avgör med ett bredare sampel.
-- ---------------------------------------------------------------------------
create table public.fixture_team_xg (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  xg numeric(6, 4),
  xgot numeric(6, 4),
  npxg numeric(6, 4),
  xg_open_play numeric(6, 4),
  xg_set_play numeric(6, 4),
  xg_corners numeric(6, 4),
  xg_free_kicks numeric(6, 4),
  xg_penalties numeric(6, 4), -- overifierad förekomst, se filhuvud
  xg_difference numeric(6, 4), -- overifierad förekomst, se filhuvud
  xg_against numeric(6, 4),
  xg_prevented numeric(6, 4),
  xpts numeric(6, 4),
  shooting_performance numeric(8, 4), -- type_id 9685 "Shooting Performance" — bekräftat befolkad men INNEBÖRD OVERIFIERAD, får inte konsumeras av analyskod än
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);
create trigger set_fixture_team_xg_updated_at
  before update on public.fixture_team_xg
  for each row execute function public.set_updated_at();
create index fixture_team_xg_fixture_idx on public.fixture_team_xg (fixture_id);

-- ---------------------------------------------------------------------------
-- fixture_pressure_index — minutupplöst matchmomentum, EN RAD PER
-- (lag, minut)-avläsning (~186-190 rader/match, bekräftat i alla tre
-- testade säsonger). Detta river den tidigare dokumenterade PERMANENTA
-- begränsningen i DATA_CATALOG.md ("retroaktiv matchmomentum: EJ MÖJLIGT").
-- Ingen unique-constraint än — grain (hantering av tilläggstid, ev.
-- dubbletter) bekräftas empiriskt i Fas 6 innan en läggs till i en
-- uppföljande migration.
-- ---------------------------------------------------------------------------
create table public.fixture_pressure_index (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  minute integer not null,
  pressure numeric(6, 2) not null,
  sportmonks_row_id bigint, -- Sportmonks eget radId, för felsökning/dedupe
  created_at timestamptz not null default now()
);
create index fixture_pressure_index_fixture_idx on public.fixture_pressure_index (fixture_id, minute);

-- ---------------------------------------------------------------------------
-- fixture_match_facts — HETEROGEN form (139 distinkta typer sedda denna
-- session, olika data-shape per typ: skalär, hemma/borta-par,
-- fördelningsobjekt). Normaliseras INTE till fasta kolumner — value_shape
-- är en diskriminant-kolumn beräknad vid importtillfället så konsumerande
-- UI-kod får en stabil switch istället för att gissa jsonb-formen. Ingen
-- unique-constraint (samma typ kan förekomma flera gånger per match, t.ex.
-- en gång per spelare för H2H-toppresultat). Import sker delete+insert per
-- fixture (samma mönster som seed-team-facts.ts), inte upsert.
-- sportmonks_type_id har MEDVETET ingen FK-constraint mot sportmonks_type —
-- en framtida ny typ ska inte kunna få hela importen att haverera.
-- ---------------------------------------------------------------------------
create table public.fixture_match_facts (
  id bigserial primary key,
  fixture_id bigint not null references public.fixture (id) on delete cascade,
  sportmonks_type_id integer not null,
  team_id bigint references public.team (id) on delete set null,
  player_id bigint references public.player (id) on delete set null,
  participant text, -- 'home' | 'away' | 'both'
  basis text, -- t.ex. 'h2h'
  scope text, -- t.ex. 'all_matches' | 'league_matches'
  value_shape text not null check (value_shape in ('scalar', 'home_away', 'distribution', 'other')),
  data jsonb not null,
  natural_language text,
  category text,
  sportmonks_row_id bigint,
  created_at timestamptz not null default now()
);
create index fixture_match_facts_fixture_idx on public.fixture_match_facts (fixture_id);
create index fixture_match_facts_type_idx on public.fixture_match_facts (sportmonks_type_id);

-- ---------------------------------------------------------------------------
-- RLS: samma princip som all annan fotbollsdata — offentlig läsning för
-- produktdata, service-role-only för granskningskön (innehåller ännu
-- overifierade identitetsmappningar, inte något att visa publikt).
-- ---------------------------------------------------------------------------
alter table public.sportmonks_type enable row level security;
alter table public.sportmonks_player_mapping_candidate enable row level security;
alter table public.fixture_player_advanced_stats enable row level security;
alter table public.fixture_team_advanced_stats enable row level security;
alter table public.fixture_team_xg enable row level security;
alter table public.fixture_pressure_index enable row level security;
alter table public.fixture_match_facts enable row level security;

create policy "Public read sportmonks_type" on public.sportmonks_type for select using (true);
create policy "Public read fixture_player_advanced_stats" on public.fixture_player_advanced_stats for select using (true);
create policy "Public read fixture_team_advanced_stats" on public.fixture_team_advanced_stats for select using (true);
create policy "Public read fixture_team_xg" on public.fixture_team_xg for select using (true);
create policy "Public read fixture_pressure_index" on public.fixture_pressure_index for select using (true);
create policy "Public read fixture_match_facts" on public.fixture_match_facts for select using (true);
-- sportmonks_player_mapping_candidate: medvetet INGEN publik läspolicy (granskningskö, service-role-only, samma princip som api_raw_response/ingestion_log).
