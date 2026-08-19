-- ============================================================================
-- 0006: profiles.favorite_team_id — personalisering (differentierande v1-funktion)
-- ============================================================================
-- Låter varje inloggad användare välja vilket av de bevakade lagen (IFK
-- Göteborg / AIK) de följer, så startsidan kan öppnas direkt på "deras" lags
-- senaste resultat istället för en blank chattruta. onboarding_completed_at
-- hålls separat från favorite_team_id så att "hoppade över valet" kan
-- skiljas från "har inte tillfrågats än".

alter table public.profiles
  add column favorite_team_id bigint references public.team (id) on delete set null,
  add column onboarding_completed_at timestamptz;

-- profiles har medvetet inga UPDATE-policys (se migration 0001 — vi vill inte
-- att en klient kan skriva sin egen role). Den här RPC:n är den enda vägen in
-- för att sätta favoritlag: SECURITY DEFINER, skopad hårt till auth.uid() och
-- rör bara favorite_team_id/onboarding_completed_at — aldrig role.
create or replace function public.set_favorite_team(p_team_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set favorite_team_id = p_team_id,
      onboarding_completed_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.set_favorite_team(bigint) to authenticated;
