-- Migration 090: one listing per show when the same show is stored under two rooms / two venue records of one
-- building (Airbag, 23 Oct 2026: Ticketmaster in "O2 Academy2 Birmingham", its TicketWeb copy in "O2 Academy
-- Birmingham"; council/tourism copies such as "Music Hall" vs "Aberdeen Music Hall").
--
-- 1. events.merged_into: the kept event a duplicate was merged into. Set by the merge job (src/lib/venueFamilyMerge.ts),
--    never by an import, so the 2am Ticketmaster sync rewriting a row does not undo a merge. The duplicate row is not
--    deleted: its page 301-redirects to the kept event and it drops out of listings, sitemap and matching.
-- 2. events.info_links: non-seller links kept as data on the kept event (the council/tourism listing page of a merged
--    copy): [{ "source": "aberdeen_council", "url": "...", "from_event_id": "..." }]. Imports never write it.
-- 3. event_merge_reviews: groups a person must decide (and seller-link clashes found while merging). Server-only.
-- 4. event_canonical_calc now wraps the existing grouping (renamed event_canonical_base, unchanged): a merged
--    duplicate, and anything the old grouping had put under it, follows the kept event's group. If the kept event
--    stops being live (cancelled, past), the duplicate falls back to its own grouping, so a show never vanishes.
--    refresh_event_canonical() reads event_canonical_calc by name and needs no change.
-- Safe to re-run.

alter table public.events add column if not exists merged_into uuid references public.events (id) on delete set null;
alter table public.events add column if not exists info_links jsonb not null default '[]'::jsonb;
create index if not exists events_merged_into_idx on public.events (merged_into) where merged_into is not null;

comment on column public.events.merged_into is
  'Kept event this duplicate was merged into (same show, same building, another room / venue record). Page redirects there; hidden from listings via event_canonical_map.';
comment on column public.events.info_links is
  'Non-seller links kept as data (council / tourism listing pages of merged copies). Shown only when the event has no seller link.';

create table if not exists public.event_merge_reviews (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'duplicate_group' check (kind in ('duplicate_group', 'link_clash')),
  group_key         text not null unique,
  event_ids         uuid[] not null,
  suggested_keep_id uuid,
  reasons           text[] not null default '{}',
  summary           jsonb not null default '{}'::jsonb,
  status            text not null default 'open' check (status in ('open', 'merged', 'not_duplicate', 'resolved')),
  created_at        timestamptz not null default now(),
  decided_at        timestamptz
);
create index if not exists event_merge_reviews_open_idx on public.event_merge_reviews (created_at) where status = 'open';

alter table public.event_merge_reviews enable row level security;
grant select, insert, update, delete on public.event_merge_reviews to service_role;

do $$
begin
  if to_regclass('public.event_canonical_base') is null then
    alter view public.event_canonical_calc rename to event_canonical_base;
  end if;
end $$;

create or replace view public.event_canonical_calc
with (security_invoker = true) as
with base as materialized (
  select id, canonical_id, is_package from public.event_canonical_base
),
moved as (
  -- duplicate -> the group of the event it was merged into, while that event is still live
  select e.id, k.canonical_id as target
  from public.events e
  join base d on d.id = e.id
  join base k on k.id = e.merged_into
  where e.merged_into is not null and e.merged_into <> e.id
),
resolved as (
  select b.id, b.is_package, coalesce(m.target, mc.target, b.canonical_id) as canonical_id
  from base b
  left join moved m  on m.id  = b.id
  left join moved mc on mc.id = b.canonical_id
)
select r.id, r.canonical_id, r.is_package, (r.id = r.canonical_id) as is_canonical
from resolved r;

grant select on public.event_canonical_base to service_role;
grant select on public.event_canonical_calc to service_role;

select public.refresh_event_canonical();
