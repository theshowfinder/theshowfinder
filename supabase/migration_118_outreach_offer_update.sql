-- Founding partner offer update (12 Nov 2026): when a business emailed before the offer existed was sent the one
-- "update: your first month is now free" email (src/lib/outreachRun.ts, at most 20 a day).
alter table public.outreach_prospects add column if not exists offer_sent_at timestamptz;
