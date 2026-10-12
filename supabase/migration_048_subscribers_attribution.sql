-- Newsletter capture: record where each signup came from and when they
-- agreed. Safe to run more than once. The app keeps working if this has not
-- been run yet (signups just save without these fields).
alter table public.subscribers add column if not exists source     text;        -- page type: homepage, event, artist, venue, west-end, ...
alter table public.subscribers add column if not exists interest   text;        -- what they were looking at: artist / show / venue name
alter table public.subscribers add column if not exists consent_at timestamptz; -- when they ticked / submitted the sign-up form

create index if not exists subscribers_source_idx on public.subscribers (source) where source is not null;
