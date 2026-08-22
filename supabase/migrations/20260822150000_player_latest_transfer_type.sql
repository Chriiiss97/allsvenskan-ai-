-- ============================================================================
-- Fas 17c (2026-08-22): transfertyp/-belopp för senaste klubbytet
-- ============================================================================
-- Kompletterar migration 20260822140000 (latest_transfer_date/team_*).
-- api-football:s /transfers ger ett `type`-fält per övergång — antingen en
-- kategori ("Free", "Loan", "N/A") eller en verklig summa som rå sträng
-- ("€ 1.5M", "€ 53K") — ALDRIG en egen uppskattning, bara vad källan gav.
-- Sparas rått, tolkas/formateras vid visning (samma princip som övriga
-- translate*-fält i lib/i18n/sv.ts).

alter table public.player add column latest_transfer_type text;
