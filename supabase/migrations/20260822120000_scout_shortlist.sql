-- ============================================================================
-- Fas 14.4 (total redesign, plans/humble-giggling-biscuit.md): Scout Shortlist
-- ============================================================================
-- En användares egna "stjärnmärkta" spelare — rent klientscopat (RLS på
-- auth.uid(), samma mönster som profiles/favorite_team), ingen delning
-- mellan användare. En rad per (user, player) — unique-constraint gör
-- "stjärnmärk igen" till ett no-op istället för en dubblettrad.

create table public.scout_shortlist_player (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id bigint not null references public.player (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, player_id)
);

create index scout_shortlist_player_user_id_idx on public.scout_shortlist_player (user_id);

alter table public.scout_shortlist_player enable row level security;

-- Användaren äger fullt ut sina egna rader — select/insert/delete, ingen
-- update (en shortlist-post har inget muterbart fält bortom sin existens).
create policy "Users can view own shortlist"
  on public.scout_shortlist_player for select
  using (auth.uid() = user_id);

create policy "Users can add to own shortlist"
  on public.scout_shortlist_player for insert
  with check (auth.uid() = user_id);

create policy "Users can remove from own shortlist"
  on public.scout_shortlist_player for delete
  using (auth.uid() = user_id);
