-- ============================================================================
-- 0001: profiles (användartabell med role: user/admin)
-- ============================================================================
-- Supabase Auth äger auth.users, men den tabellen kan inte utökas direkt.
-- Vi speglar varje inloggad användare i public.profiles med en role-kolumn,
-- enligt principen i PROJEKT_BRIEF.md ("Roller: användare vs. admin").

create extension if not exists "pgcrypto";

create type public.user_role as enum ('user', 'admin');

-- Generisk trigger-funktion för updated_at, återanvänds av flera tabeller.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role public.user_role not null default 'user',
  -- Enkel dagskvot-räknare (se PROJEKT_BRIEF.md "Gratiskvot"). Nollställs av
  -- applikationslogiken när quota_date inte längre är dagens datum.
  daily_message_count integer not null default 0,
  quota_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Säkert sätt att kolla "är jag admin?" i RLS-policys utan rekursiva
-- policy-lookups (security definer kringgår RLS för själva kollen).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Skapar automatiskt en profilrad när en användare loggar in första gången
-- via Supabase Auth. Projektägarens Google-konto (se userEmail i kontexten)
-- markeras direkt som admin, i linje med "seedat direkt"-alternativet i
-- PROJEKT_BRIEF.md. Byt ut e-postadressen här om ägarkontot ändras.
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
    case when new.email = 'ci.carlsson97@gmail.com' then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Bara SELECT-policys: profiler skapas/uppdateras via triggern ovan (security
-- definer) eller server-side med service role-nyckeln. Ingen klient kan alltså
-- skriva sin egen role -> ingen väg till självutnämnd admin.
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());
