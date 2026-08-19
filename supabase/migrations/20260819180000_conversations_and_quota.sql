-- ============================================================================
-- 0009: conversation/message + increment_message_quota()
-- ============================================================================
-- Behövs för steg 6 (chat-endpointen): dels för att Claude ska kunna hålla
-- kontext inom en konversation, dels för att räkna gratiskvoten
-- (3 meddelanden/dag/konto, se PROJEKT_BRIEF.md "Gratiskvot").

create table public.conversation (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_conversation_updated_at
  before update on public.conversation
  for each row execute function public.set_updated_at();

create index conversation_user_idx on public.conversation (user_id, updated_at desc);

create table public.message (
  id bigserial primary key,
  conversation_id bigint not null references public.conversation (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index message_conversation_idx on public.message (conversation_id, created_at);

alter table public.conversation enable row level security;
alter table public.message enable row level security;

-- Konversationshistorik är personuppgifter (kopplat till Google-konto) —
-- en användare ser bara sina egna, admin ser allas (se PROJEKT_BRIEF.md
-- "Konversationshistorik").
create policy "Users can view own conversations"
  on public.conversation for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can create own conversations"
  on public.conversation for insert
  with check (auth.uid() = user_id);

create policy "Users can view own messages"
  on public.message for select
  using (
    exists (
      select 1 from public.conversation c
      where c.id = message.conversation_id
        and (c.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users can insert own messages"
  on public.message for insert
  with check (
    exists (
      select 1 from public.conversation c
      where c.id = message.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Atomär kvot-räknare: nollställer dagskvoten om det är ett nytt datum,
-- nekar om gränsen är nådd, annars räknar upp — allt i en transaktion med
-- radlås (FOR UPDATE) så två samtidiga requests inte kan runda kvoten.
-- Admin-konton undantas helt (se PROJEKT_BRIEF.md "Roller").
create or replace function public.increment_message_quota(p_daily_limit integer)
returns table (allowed boolean, daily_message_count integer)
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
