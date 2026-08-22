-- ============================================================================
-- Fas 14.5 (total redesign, plans/humble-giggling-biscuit.md): Scout-åtkomst
-- ============================================================================
-- UI-lager för premium-gating INNAN riktig betalning finns (beslutat med
-- användaren i planeringen av Fas 14: "bara UI + manuell flagga", riktig
-- betalning kopplas på i en senare fas). Samma enkla mönster som
-- profiles.role redan använder för admin-gating — en boolean, satt manuellt
-- av admin via /admin/users/[id] (ingen självbetjänings-checkout).
--
-- Admins ser ALLTID Scout (behöver det för att bygga/supporta produkten),
-- oavsett scout_access — se lib/auth/premium.ts:s hasScoutAccess().

alter table public.profiles
  add column scout_access boolean not null default false;

-- profiles har MEDVETET inga UPDATE-policys alls (se migration 0001s
-- kommentar: "ingen klient kan alltså skriva sin egen role -> ingen väg
-- till självutnämnd admin") — en generell "admin kan uppdatera profiles"-
-- RLS-policy hade öppnat för att en admin (via en hantverkad request)
-- skriver VILKEN kolumn som helst, inte bara scout_access. Samma smala,
-- funktionsscopade mönster som set_favorite_team (migration
-- 20260819150000_favorite_team.sql) istället: en SECURITY DEFINER-
-- funktion som bara kan skriva EXAKT scout_access, och bara om anroparen
-- redan är admin.
create or replace function public.set_scout_access(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast admin kan ändra scout_access.';
  end if;

  update public.profiles set scout_access = p_enabled where id = p_user_id;
end;
$$;
