-- Migration 127: organisers can list anywhere in the UK, not only our 40 cities. Safe to re-run.
-- event_submissions.city is the city page it shows on (nearest of our 40, by postcode); town is where it really is.
alter table public.event_submissions add column if not exists town text;
