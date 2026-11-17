-- Migration 129: people who sell event tickets (promoters, venues, event organisers), found on public event
-- listings, to offer TheShowFinder's free listings and tickets. Server only. Safe to re-run.
create table if not exists public.organiser_prospects (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,                 -- 'eventbrite'
  source_id          text not null,                 -- their organiser id there
  name               text,
  profile_url        text,
  city               text not null,                 -- our city where we first found them
  towns              text[] not null default '{}',  -- towns their events are in
  events_seen        integer not null default 0,    -- upcoming events we saw on the listings
  total_events       integer,                       -- events they have run in total (their profile)
  attendees_hosted   text,                          -- "2.2k" (their profile)
  sample_event       text,
  sample_event_url   text,
  sample_venue       text,
  next_event_date    date,
  website            text,
  facebook           text,
  instagram          text,
  twitter            text,
  email              text,
  phone              text,
  company_number     text,
  company_name       text,
  company_type       text not null default 'unknown',   -- ltd (confirmed with Companies House) | unconfirmed | unknown
  contact_route      text not null default 'pending',   -- pending | email | social | none
  status             text not null default 'new',       -- new | contacted | replied | listed | not_interested | unsubscribed
  notes              text,
  found_at           timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  profiled_at        timestamptz,
  checked_at         timestamptz,
  unique (source, source_id)
);
create index if not exists organiser_prospects_route_idx on public.organiser_prospects (contact_route, status);
create index if not exists organiser_prospects_city_idx on public.organiser_prospects (city);
create index if not exists organiser_prospects_todo_idx on public.organiser_prospects (profiled_at, checked_at);
alter table public.organiser_prospects enable row level security;
revoke all on public.organiser_prospects from anon, authenticated;
grant select, insert, update, delete on public.organiser_prospects to service_role;

-- Which city listings were searched when, so every city comes round in turn.
create table if not exists public.organiser_search_log (
  city         text primary key,
  searched_at  timestamptz not null default now(),
  pages        integer not null default 0,
  organisers   integer not null default 0
);
alter table public.organiser_search_log enable row level security;
revoke all on public.organiser_search_log from anon, authenticated;
grant select, insert, update, delete on public.organiser_search_log to service_role;
