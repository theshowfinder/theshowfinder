-- Every place the outreach finder's map search turns up, kept so later runs can work through it without asking the
-- (often busy) public map service again. A row is done once its key is in outreach_scanned.
create table if not exists public.outreach_candidates (
  key text primary key,          -- OpenStreetMap "node/123"
  city text not null,
  name text not null,
  website text not null,
  lat double precision,
  lng double precision,
  venue text,
  metres integer,
  chain boolean not null default false,
  tags jsonb,
  found_at timestamptz not null default now()
);
create index if not exists outreach_candidates_city_idx on public.outreach_candidates (city);
alter table public.outreach_candidates enable row level security;
grant select, insert, update, delete on public.outreach_candidates to service_role;   -- Supabase Data API: new tables need explicit grants (30 Oct 2026)
