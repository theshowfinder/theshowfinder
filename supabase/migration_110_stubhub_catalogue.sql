-- StubHub International event catalog (Impact catalog 17571), UK shows only.
-- Filled nightly by /api/cron/sync-stubhub, matched to site events by /api/cron/match-stubhub.
create table if not exists public.stubhub_catalogue_events (
  id text primary key,                       -- StubHub event id (Impact CatalogItemId)
  name text not null,
  parent_name text,                          -- the act / show StubHub files it under
  category text,
  labels text[],
  event_start timestamptz,
  event_date date,
  event_time text,                           -- local "19:30"
  venue text,
  city text,
  url text not null,                         -- https://www.stubhub.co.uk/.../event/<id>/ (tracking added by /out/sh)
  min_price_usd numeric,
  image_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  gone_at timestamptz,
  matched_event_id uuid references public.events(id) on delete set null,
  match_status text not null default 'pending',
  match_confidence numeric,
  match_reason text,
  match_checked_at timestamptz
);
create index if not exists stubhub_catalogue_events_date_idx on public.stubhub_catalogue_events (event_date);
create index if not exists stubhub_catalogue_events_matched_idx on public.stubhub_catalogue_events (matched_event_id);
alter table public.stubhub_catalogue_events enable row level security;

-- Cheapest StubHub price for the show, in pounds, shown on the StubHub button.
alter table public.events add column if not exists stubhub_from numeric;
