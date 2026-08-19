-- ============================================================================
-- 0005: team.website_url
-- ============================================================================
-- Officiell klubbhemsida, del av den strukturerade lagfaktan (se
-- PROJEKT_BRIEF.md "Kvalitativ lagdata").

alter table public.team
  add column website_url text;
