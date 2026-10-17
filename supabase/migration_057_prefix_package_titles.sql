-- Migration 057: also recognise PREFIX-style package titles.
--
-- Migration 055 only recognised packages whose title ENDS with the package words
-- ("<Show> - Live Lounge Premium Package"). Ticketmaster also publishes them as
-- "Venue Premium - <Show>", "Venue Premium Packages - <Show>", "VIP Upgrades -
-- <Show>", "North Shared Lounge - <Show>". Those stayed listed as their own
-- events (about 200 live rows). They are now grouped under the standard
-- performance of <Show> on the same venue and day; with no such performance the
-- package stays listed. Replaces the grouping view (event_canonical_calc); the
-- stored map (migration 056) picks it up on the next refresh.
-- Already applied in production.

create or replace view public.event_canonical_calc
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
    regexp_match(btrim(e.title), '^(.*\S)\s*[-–—:|]\s*([^-–—:|]*)$') as m,
    regexp_match(btrim(e.title), '^(?:north |south |east |west )?(?:venue premium(?: packages?| tickets?)?|premium (?:tickets?|packages?)|vip (?:upgrades?|packages?|tickets?|experiences?)|(?:shared |live )?lounge|hospitality)\s*[-–—:|]\s*(\S.*)$', 'i') as mp
  from public.events e
  where e.start_date >= now() - interval '2 days'
    and e.venue_id is not null
    and e.status::text in ('upcoming', 'on_sale', 'sold_out')
    and btrim(coalesce(e.title, '')) <> ''
),
typed as (
  select s.*,
    ((s.m is not null and s.m[2] ~* '(venue premium|premium (tickets?|packages?|priced)|vip (premium|packages?|tickets?|soundcheck|experiences?)|live lounge|official (vip|premium)|hospitality|merch bundle)')
      or s.mp is not null) as is_package
  from src s
),
based as (
  select t.*,
    coalesce(
      nullif(
        regexp_replace(
          translate(lower(case when t.mp is not null then t.mp[1] when t.is_package then t.m[1] else t.title end), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
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
from mapped m;;
