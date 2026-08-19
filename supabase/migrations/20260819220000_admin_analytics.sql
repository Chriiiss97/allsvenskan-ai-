-- ============================================================================
-- 0013: Admin-analys — verktygsanrop, AI-kostnad, feature flags
-- ============================================================================
-- Bygger ut adminpanelen (app/(app)/admin) med riktig produktinsikt istället
-- för bara råa radräkningar: vilka verktyg (och därmed vilka frågetyper/lag)
-- använders faktiskt, vad kostar Claude-anropen, och en minimal on/off-
-- mekanism för att stänga av en funktion utan omdeploy.

-- message_tool_call: en rad per verktygsanrop Claude gjorde för att besvara
-- ett meddelande. Ger "vad frågar användarna om" (gruppera på tool_name) och
-- "mest efterfrågade lag" (gruppera på team) utan att gissa på fritext.
create table public.message_tool_call (
  id bigserial primary key,
  message_id bigint not null references public.message (id) on delete cascade,
  tool_name text not null,
  team text, -- normaliserat "team"-parametervärde när verktyget tog ett, annars null
  created_at timestamptz not null default now()
);
create index message_tool_call_message_idx on public.message_tool_call (message_id);
create index message_tool_call_tool_idx on public.message_tool_call (tool_name);

-- message_usage: token-/kostnads-/svarstidsdata för ETT assistant-svar
-- (summerat över hela tool-calling-loopens Claude-anrop för det svaret).
create table public.message_usage (
  id bigserial primary key,
  message_id bigint not null unique references public.message (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer,
  created_at timestamptz not null default now()
);

-- feature_flag: minimal on/off-mekanism admin kan slå av utan omdeploy.
-- Bara en flagga seedas nu (chat_enabled) som ett verkligt, kopplat exempel
-- — fler kan läggas till samma väg när det finns en konkret funktion att
-- koppla dem till.
create table public.feature_flag (
  key text primary key,
  label text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger set_feature_flag_updated_at
  before update on public.feature_flag
  for each row execute function public.set_updated_at();

insert into public.feature_flag (key, label, enabled) values
  ('chat_enabled', 'Chatta (hela chattfunktionen)', true);

alter table public.message_tool_call enable row level security;
alter table public.message_usage enable row level security;
alter table public.feature_flag enable row level security;

-- Samma mönster som "Users can insert own messages": servern skriver med
-- den inloggade användarens session (inte service role), så insert-policyn
-- måste tillåta det via ägarskap på konversationen. Bara admin läser.
create policy "Users can insert own message_tool_call"
  on public.message_tool_call for insert
  with check (
    exists (
      select 1 from public.message m
      join public.conversation c on c.id = m.conversation_id
      where m.id = message_tool_call.message_id and c.user_id = auth.uid()
    )
  );

create policy "Admins can view message_tool_call"
  on public.message_tool_call for select
  using (public.is_admin());

create policy "Users can insert own message_usage"
  on public.message_usage for insert
  with check (
    exists (
      select 1 from public.message m
      join public.conversation c on c.id = m.conversation_id
      where m.id = message_usage.message_id and c.user_id = auth.uid()
    )
  );

create policy "Admins can view message_usage"
  on public.message_usage for select
  using (public.is_admin());

-- feature_flag måste vara läsbar av ALLA inloggade (klienten behöver veta
-- om t.ex. chatten är avstängd), men bara admin får ändra den.
create policy "Authenticated users can read feature flags"
  on public.feature_flag for select
  using (auth.role() = 'authenticated');

create policy "Admins can update feature flags"
  on public.feature_flag for update
  using (public.is_admin());
