-- See Tickets UK product-feed cache.
-- Keep the affiliate feed separate from public events until a row has been
-- matched and approved. This makes imports safe and auditable.
create table if not exists public.see_tickets_catalogue_events (
  id text primary key,
  merchant_product_id text,
  name text not null,
  event_date date,
  venue text,
  city text,
  country text,
  primary_artist text,
  second_artist text,
  genre text,
  url text not null,
  availability_status text,
  available_from timestamptz,
  valid_from timestamptz,
  valid_to timestamptz,
  min_price numeric,
  max_price numeric,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  matched_event_id uuid references public.events(id) on delete set null,
  match_status text not null default 'pending',
  match_confidence numeric,
  match_reason text,
  match_checked_at timestamptz
);

create index if not exists see_tickets_catalogue_date_idx
  on public.see_tickets_catalogue_events (event_date);
create index if not exists see_tickets_catalogue_city_idx
  on public.see_tickets_catalogue_events (city);
create index if not exists see_tickets_catalogue_match_idx
  on public.see_tickets_catalogue_events (match_status);
create index if not exists see_tickets_catalogue_matched_event_idx
  on public.see_tickets_catalogue_events (matched_event_id);

alter table public.see_tickets_catalogue_events enable row level security;

create policy "service role manages See Tickets catalogue"
  on public.see_tickets_catalogue_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
