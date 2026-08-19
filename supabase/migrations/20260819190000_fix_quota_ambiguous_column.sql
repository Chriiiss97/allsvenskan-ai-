-- ============================================================================
-- 0010: fixa increment_message_quota() — "column reference is ambiguous"
-- ============================================================================
-- RETURNS TABLE(..., daily_message_count integer) skapar implicit en
-- variabel med samma namn som profiles.daily_message_count-kolumnen. Inuti
-- UPDATE ... SET daily_message_count = v_count blir det då tvetydigt: menar
-- vi tabellkolumnen eller OUT-variabeln? Postgres vägrar gissa och kastar
-- ett fel. Löser genom att döpa om returkolumnen till message_count.
-- Upptäckt genom att testa /api/chat end-to-end mot en riktig inloggad
-- testanvändare innan Google-inloggningen är på plats.
-- ============================================================================

drop function if exists public.increment_message_quota(integer);

create or replace function public.increment_message_quota(p_daily_limit integer)
returns table (allowed boolean, message_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_count integer;
  v_quota_date date;
begin
  select role, daily_message_count, quota_date
    into v_role, v_count, v_quota_date
    from public.profiles
    where id = auth.uid()
    for update;

  if v_role is null then
    return query select false, 0;
    return;
  end if;

  if v_role = 'admin' then
    return query select true, v_count;
    return;
  end if;

  if v_quota_date is distinct from current_date then
    v_count := 0;
    v_quota_date := current_date;
  end if;

  if v_count >= p_daily_limit then
    update public.profiles set quota_date = v_quota_date where id = auth.uid();
    return query select false, v_count;
    return;
  end if;

  v_count := v_count + 1;
  update public.profiles
    set daily_message_count = v_count, quota_date = v_quota_date
    where id = auth.uid();

  return query select true, v_count;
end;
$$;

grant execute on function public.increment_message_quota(integer) to authenticated;
