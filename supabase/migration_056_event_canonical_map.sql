-- Migration 056: make the canonical grouping from migration 055 fast.
--
-- The grouping view (event_canonical_calc) scans every upcoming event with
-- window functions, about 3 seconds per query: fine as a source, too slow to sit
-- under every page and count. So the result is stored in event_canonical_map and
-- refreshed by refresh_event_canonical(), called by /api/cron/refresh-listings
-- after the import windows (so the Ticketmaster / See Tickets / Gigsberg import
-- code is not touched at all). listed_events_with_venue joins the stored map;
-- any event the map has not seen yet (imported since the last refresh) is listed
-- as-is, so nothing real ever disappears while waiting for a refresh.
--
-- NOTE: already applied in production (applied piece by piece).

alter view if exists public.event_canonical rename to event_canonical_calc;

create table if not exists public.event_canonical_map (
  id           uuid primary key,
  canonical_id uuid not null,
  is_package   boolean not null,
  is_canonical boolean not null,
  refreshed_at timestamptz not null default now()
);
-- Deliberately no foreign key to events: an import that deletes an event must
-- never be blocked or cascaded by this table.
create index if not exists event_canonical_map_canonical_idx on public.event_canonical_map (canonical_id);

alter table public.event_canonical_map enable row level security;
create policy "Public read event_canonical_map" on public.event_canonical_map for select to anon, authenticated using (true);

create or replace function public.refresh_event_canonical()
returns integer
language sql
security definer
set search_path = public
as $body$
  with calc as materialized (
    select id, canonical_id, is_package, is_canonical from public.event_canonical_calc
  ),
  del as (
    delete from public.event_canonical_map m
    where not exists (select 1 from calc c where c.id = m.id)
    returning 1
  ),
  ups as (
    insert into public.event_canonical_map as m (id, canonical_id, is_package, is_canonical, refreshed_at)
    select c.id, c.canonical_id, c.is_package, c.is_canonical, now() from calc c
    on conflict (id) do update
      set canonical_id = excluded.canonical_id,
          is_package   = excluded.is_package,
          is_canonical = excluded.is_canonical,
          refreshed_at = excluded.refreshed_at
      where (m.canonical_id, m.is_package, m.is_canonical)
        is distinct from (excluded.canonical_id, excluded.is_package, excluded.is_canonical)
    returning 1
  )
  select ((select count(*) from del) + (select count(*) from ups))::integer
$body$;

revoke execute on function public.refresh_event_canonical() from public, anon, authenticated;
grant execute on function public.refresh_event_canonical() to service_role;
grant select on public.event_canonical_calc to service_role;

create or replace view public.listed_events_with_venue
with (security_invoker = true) as
select ewv.*
from public.events_with_venue ewv
left join public.event_canonical_map m on m.id = ewv.id
where m.id is null or m.is_canonical;

grant select on public.listed_events_with_venue to anon, authenticated, service_role;
