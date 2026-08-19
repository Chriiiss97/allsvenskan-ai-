-- ============================================================================
-- 0007: fixa handle_new_user() — CASE-uttrycket typades som text, inte
-- public.user_role, vilket fick INSERT i profiles att misslyckas och därmed
-- HELA auth.users-inserten att rulla tillbaka. Resultat: varje inloggning
-- (Google eller annars) hade failat med "Database error creating new user".
-- Upptäckt genom att testa flödet med en riktig testanvändare innan
-- Google-inloggningen kopplades in på riktigt.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    (case when new.email = 'ci.carlsson97@gmail.com' then 'admin' else 'user' end)::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
