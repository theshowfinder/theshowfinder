-- Outreach A/B subject lines (12 Nov 2026): which subject version a business got with its first email ('A' or 'B'),
-- so the follow-up replies to the same subject. Null = emailed before the A/B test (old subject). Already run in production.
alter table public.outreach_prospects add column if not exists subject_variant text;
