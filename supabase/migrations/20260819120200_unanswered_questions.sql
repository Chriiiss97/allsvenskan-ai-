-- ============================================================================
-- 0003: unanswered_questions
-- ============================================================================
-- Loggar frågor som boten inte kunde besvara med tillgängliga tool-calls
-- (se PROJEKT_BRIEF.md "Obesvarade frågor"), så admin kan se vilka
-- frågetyper som saknas. Enkel loggning i v1 — inget admin-UI byggs än.

create table public.unanswered_questions (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  question_text text not null,
  context text, -- t.ex. vilket verktyg som saknades eller konversationsutdrag
  resolved boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index unanswered_questions_resolved_idx on public.unanswered_questions (resolved);
create index unanswered_questions_user_idx on public.unanswered_questions (user_id);

alter table public.unanswered_questions enable row level security;

-- Chat-endpointen (steg 6) loggar åt den inloggade användaren själv, via
-- anon-nyckeln + användarens session — därför tillåts insert där user_id
-- matchar den inloggade. Den kan även loggas server-side med service role.
create policy "Users can log their own unanswered questions"
  on public.unanswered_questions for insert
  with check (auth.uid() = user_id);

-- Bara admin (se profiles.role) ser och hanterar loggade frågor.
create policy "Admins can view unanswered questions"
  on public.unanswered_questions for select
  using (public.is_admin());

create policy "Admins can update unanswered questions"
  on public.unanswered_questions for update
  using (public.is_admin());
