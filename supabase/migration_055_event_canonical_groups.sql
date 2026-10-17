-- Migration 055: canonical event groups (read-only views, no data changes).
--
-- Why: the same real-world show can exist as several `events` rows:
--   * premium / VIP / lounge package listings that Ticketmaster publishes as
--     separate events ("<Show> - Live Lounge Premium Package",
--     "<Show> - Venue Premium Tickets", "<Show> - VIP Premium Package", ...)
--   * the same show imported twice from different sources (Ticketmaster and
--     See Tickets) with the same title, venue and day.
-- Listing pages and counts treated every row as its own event, so Derby (and
-- every other city) showed the same artist several times and the counts were
-- inflated.
--
-- What: `event_canonical` maps every live, upcoming event to the one row that
-- represents its show (`canonical_id`). `listed_events_with_venue` is
-- events_with_venue restricted to those canonical rows, and is the single
-- source for listings and counts. Nothing is deleted or rewritten: the
-- Ticketmaster / See Tickets / Gigsberg imports keep writing `events` exactly
-- as before, every URL keeps resolving, and the package/duplicate rows keep
-- their own ticket links (the event page shows them as extra options).
--
-- Grouping rules (deliberately conservative: when in doubt a row stays listed):
--   * Package row = title ends in "<separator> <package words>" such as Venue
--     Premium Tickets, VIP Premium Package, Live Lounge Premium Package,
--     Official VIP Ticket Experiences, hospitality, merch bundle.
--   * Standard rows with the same normalised title, venue and London day whose
--     start times are within 2 hours of each other are one performance. The
--     Ticketmaster row (source is null) wins, then the oldest row.
--   * A package joins the standard performance on the same venue and London
--     day whose normalised title equals the package's base title, or contains it
--     (the standard listing often adds a tour subtitle; the base title must be
--     at least 8 characters). Exact matches win, then the nearest start time.
--     With no such performance the package stays listed as its own event.
--   * Titles are compared without accents or punctuation (Bjorn / Björn).
--   * Only live statuses (upcoming, on_sale, sold_out) from two days ago
--     onwards take part; cancelled, postponed, past or untitled/venue-less
--     rows never appear in the listed view.

create or replace view public.event_canonical
with (security_invoker = true) as
with src as (
  select
    e.id,
    e.venue_id,
    e.start_date,
    e.created_at,
    btrim(e.title) as title,
    (e.start_date at time zone 'Europe/London')::date as day,
    (e.source is null and e.ticketmaster_id is not null) as is_tm,
    regexp_match(btrim(e.title), '^(.*\S)\s*[-–—:|]\s*([^-–—:|]*)$') as m
  from public.events e
  where e.start_date >= now() - interval '2 days'
    and e.venue_id is not null
    and e.status::text in ('upcoming', 'on_sale', 'sold_out')
    and btrim(coalesce(e.title, '')) <> ''
),
typed as (
  select s.*,
    (s.m is not null and s.m[2] ~* '(venue premium|premium (tickets?|packages?|priced)|vip (premium|packages?|tickets?|soundcheck|experiences?)|live lounge|official (vip|premium)|hospitality|merch bundle)') as is_package
  from src s
),
based as (
  select t.*,
    coalesce(
      nullif(
        regexp_replace(
          translate(lower(case when t.is_package then t.m[1] else t.title end), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
          '[^a-z0-9]+', '', 'g'),
        ''),
      t.id::text
    ) as base_norm
  from typed t
),
std_gaps as (
  select b.*,
    lag(b.start_date) over (partition by b.base_norm, b.venue_id, b.day order by b.start_date, b.id) as prev_start
  from based b
  where not b.is_package
),
std_clusters as (
  select g.*,
    sum(case when g.prev_start is null or g.start_date - g.prev_start > interval '2 hours' then 1 else 0 end)
      over (partition by g.base_norm, g.venue_id, g.day order by g.start_date, g.id) as cluster_no
  from std_gaps g
),
std as (
  select c.id, c.base_norm, c.venue_id, c.day, c.start_date,
    first_value(c.id) over (
      partition by c.base_norm, c.venue_id, c.day, c.cluster_no
      order by c.is_tm desc, c.created_at, c.id
    ) as canonical_id
  from std_clusters c
),
pkg as (
  select p.id,
    coalesce(
      (
        select h.canonical_id
        from std h
        where h.venue_id = p.venue_id and h.day = p.day
          and (h.base_norm = p.base_norm
               or (length(p.base_norm) >= 8 and strpos(h.base_norm, p.base_norm) > 0))
        order by (h.base_norm = p.base_norm) desc,
                 abs(extract(epoch from (h.start_date - p.start_date)))
        limit 1
      ),
      p.id
    ) as canonical_id
  from based p
  where p.is_package
),
mapped as (
  select s.id, s.canonical_id, false as is_package from std s
  union all
  select k.id, k.canonical_id, true as is_package from pkg k
)
select m.id, m.canonical_id, m.is_package, (m.id = m.canonical_id) as is_canonical
from mapped m;

comment on view public.event_canonical is
  'Maps each live upcoming event to the canonical row for its show (package variants and cross-source duplicates collapse onto one). Read-only; see migration 055.';

create or replace view public.listed_events_with_venue
with (security_invoker = true) as
select ewv.*
from public.events_with_venue ewv
join public.event_canonical ec on ec.id = ewv.id
where ec.is_canonical;

comment on view public.listed_events_with_venue is
  'events_with_venue restricted to canonical, live, upcoming events. The single source for public listings and event counts.';

grant select on public.event_canonical to anon, authenticated, service_role;
grant select on public.listed_events_with_venue to anon, authenticated, service_role;
