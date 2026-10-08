-- Gigsberg affiliate catalogue cache.
-- Keeps the complete external catalogue separate from core events until a
-- reliable artist/date/venue match has been confirmed.
create table if not exists public.gigsberg_catalogue_events (
  id bigint primary key,
  name text not null,
  event_date date not null,
  event_time time,
  venue text,
  city text,
  country text,
  performer1 text,
  performer2 text,
  tour text,
  url text not null,
  min_price numeric,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  matched_event_id uuid references public.events(id) on delete set null
);

create index if not exists gigsberg_catalogue_date_idx
  on public.gigsberg_catalogue_events (event_date);
create index if not exists gigsberg_catalogue_city_idx
  on public.gigsberg_catalogue_events (city);
create index if not exists gigsberg_catalogue_matched_idx
  on public.gigsberg_catalogue_events (matched_event_id);

alter table public.gigsberg_catalogue_events enable row level security;

create policy "service role manages Gigsberg catalogue"
  on public.gigsberg_catalogue_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
