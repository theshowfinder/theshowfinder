-- Migration 058: match premium / VIP packages to their standard event more loosely.
--
-- After 055-057 some packages were still listed as their own event because the
-- titles differ slightly: "N-Dubz Official Vip Ticket Experiences" (no
-- separator) vs "N-Dubz - The Legacy Tour", "Venue Premium - The Courteeners" vs
-- "Courteeners", "Ocean Color Scene" vs "Ocean Colour Scene", "Squeeze - Venue
-- Premium Tickets" vs "Squeeze plus Very Special Guest Billy Bragg".
-- Changes (all still require the SAME venue and the SAME London day):
--   * package detection also covers "<Show> Official VIP Ticket Experiences",
--     "... Premium Ticket ..." with no separator; the base title is the text
--     before the package words;
--   * a leading "The" is ignored when comparing titles;
--   * besides exact / long-containment matches, a package also joins a standard
--     performance starting within 3 hours when the package's base title is the
--     start of (or inside, 5+ chars) the standard title, the standard title is
--     inside the package title, or both share the same first word (5+ chars).
-- A package with no match stays listed (conservative). Already applied in prod.

create or replace view public.event_canonical_calc
with (security_invoker = true) as
with src as (
  select
    e.id, e.venue_id, e.start_date, e.created_at,
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
      or s.mp is not null
      or s.title ~* '\m(official\s+)?(vip|premium)\M.*\m(tickets?|experiences?|packages?|upgrades?)\M\s*$') as is_package
  from src s
),
titled as (
  select t.*,
    case
      when t.mp is not null then t.mp[1]
      when t.is_package and t.m is not null and t.m[2] ~* '(venue premium|premium (tickets?|packages?|priced)|vip (premium|packages?|tickets?|soundcheck|experiences?)|live lounge|official (vip|premium)|hospitality|merch bundle)' then t.m[1]
      when t.is_package then regexp_replace(t.title, '\s*[-–—:|]?\s*(official\s+)?(venue premium|vip|premium|live lounge|hospitality)\M.*$', '', 'i')
      else t.title
    end as base_title
  from typed t
),
based as (
  select t.*,
    coalesce(
      nullif(
        regexp_replace(
          regexp_replace(translate(lower(t.base_title), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '^\s*the\s+', ''),
          '[^a-z0-9]+', '', 'g'),
        ''),
      t.id::text
    ) as base_norm,
    nullif(
      case when length(split_part(regexp_replace(translate(lower(t.base_title), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '^\s*the\s+', ''), ' ', 1)) >= 5
           then regexp_replace(split_part(regexp_replace(translate(lower(t.base_title), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '^\s*the\s+', ''), ' ', 1), '[^a-z0-9]+', '', 'g')
      end, '') as first_word
  from titled t
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
  select c.id, c.base_norm, c.first_word, c.venue_id, c.day, c.start_date,
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
          and (
            h.base_norm = p.base_norm
            or (length(p.base_norm) >= 8 and strpos(h.base_norm, p.base_norm) > 0)
            or (
              abs(extract(epoch from (h.start_date - p.start_date))) <= 10800
              and (
                (length(p.base_norm) >= 3 and left(h.base_norm, length(p.base_norm)) = p.base_norm)
                or (length(p.base_norm) >= 5 and strpos(h.base_norm, p.base_norm) > 0)
                or (length(h.base_norm) >= 8 and strpos(p.base_norm, h.base_norm) > 0)
                or (p.first_word is not null and p.first_word = h.first_word)
              )
            )
          )
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
