-- ============================================================================
-- player_season_rating — persisterat Player Rating-lager (2026-08-21)
-- ============================================================================
-- Player Rating (lib/football/rating/*) kunde tidigare bara räknas fram live
-- vid varje sidvisning — computeSeasonOvrMap paginerar HELA säsongens
-- fixture_player_stats (två gånger: en för utespelare, en för målvakter) för
-- att räkna fram OVR för en enda spelare eller lista. Fungerar, men kostar
-- samma dyra beräkning om och om igen — särskilt orimligt för två nya
-- funktioner som uttryckligen behöver FLERA säsonger samtidigt: en spelares
-- OVR-historik (profilsidan) och en ligabred "mest förbättrad/försämrad"-
-- jämförelse (Topplistan). Den här tabellen är facit, skriven av en batch-
-- körning (scripts/import/refresh-ratings.ts), inte av produktkoden.
--
-- Medvetet SMALT: bara OVR + konfidens + egna minuter, INTE hela
-- kategori/mått-nedbrytningen ("varför X?"). Den nedbrytningen behövs bara
-- för EN säsong i taget när en användare faktiskt tittar på den — där är
-- den befintliga, redan verifierade live-beräkningen (computePlayerRating/
-- computeGoalkeeperRating) kvar oförändrad. Den här tabellen optimerar bara
-- de fallen där MÅNGA spelare eller MÅNGA säsonger behövs samtidigt.
--
-- Upsert per (player_id, season_id) — en rad per spelare/säsong, senaste
-- beräkning vinner (INTE append-only som standings/fixture_live_snapshots,
-- vi vill bara ha facit just nu, inte ett historiskt spår av beräkningen
-- själv).
create table public.player_season_rating (
  id bigserial primary key,
  player_id bigint not null references public.player (id) on delete cascade,
  season_id bigint not null references public.season (id) on delete cascade,
  -- "goalkeeper" | "defender" | "midfielder" | "attacker" — vilken av de två
  -- helt separata modellerna (se lib/football/position-group.ts) som
  -- användes, så läsare vet hur talet ska tolkas utan en extra uppslagning.
  position_group text not null check (position_group in ('goalkeeper', 'defender', 'midfielder', 'attacker')),
  ovr integer,
  confidence_tier text check (confidence_tier in ('hög', 'medel', 'låg')),
  own_minutes integer not null default 0,
  computed_at timestamptz not null default now(),
  unique (player_id, season_id)
);

create index player_season_rating_player_idx on public.player_season_rating (player_id);
create index player_season_rating_season_idx on public.player_season_rating (season_id);

alter table public.player_season_rating enable row level security;

-- Samma princip som all annan fotbollsdata: offentlig läsning (produktdata),
-- skrivs bara server-side med service role-nyckeln (kringgår RLS helt) via
-- scripts/import/refresh-ratings.ts.
create policy "Public read player_season_rating" on public.player_season_rating for select using (true);
