-- Migration 138: repeat events. Every date of a weekly / monthly night is its own submission (and event page),
-- linked by series_id so one approval publishes them all.
alter table public.event_submissions add column if not exists series_id uuid;
create index if not exists event_submissions_series_idx on public.event_submissions (series_id) where series_id is not null;
