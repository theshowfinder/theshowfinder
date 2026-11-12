-- Founding partner offer (12 Nov 2026): first month free, then monthly, cancel any time, for businesses signing up from
-- an outreach email by 31 Dec 2026. `offer` marks those applications; payment_status 'trial' = card saved, free month
-- running until trial_ends_at; trial_report_sent_at = the three-week check-in email (cron founding-partners) went.
alter table public.advertiser_applications add column if not exists offer text;
alter table public.advertiser_applications add column if not exists trial_ends_at timestamptz;
alter table public.advertiser_applications add column if not exists trial_report_sent_at timestamptz;
alter table public.advertiser_applications drop constraint if exists advertiser_applications_payment_status_check;
alter table public.advertiser_applications add constraint advertiser_applications_payment_status_check
  check (payment_status = any (array['pending', 'paid', 'waived', 'trial']));
