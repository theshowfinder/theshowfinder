-- Already applied to the live database (migration "show_tiles_and_dates").
--
-- browse_show_tiles: one row per SHOW (a run at a venue, or a tour across towns) for the /events list.
--   * The tile's event is the show's date in the visitor's city when it has one (p_city filter, else p_home_city),
--     otherwise its next date anywhere.
--   * Also returns how many dates in total, how many in the home city, how many cities, and the next few other
--     cities (soonest first) for the "also in Leeds, Glasgow +11" teaser.
--   * With p_city set, only shows that have a date in that city are returned (but the "also in" teaser still
--     reports the other cities).
-- show_dates: every upcoming date of the same show as one event, for the "All dates" list on the event page.
--   Same grouping rule as the tiles: headline artist (else venue) + title before " - ".

create or replace function public.browse_show_tiles(
  p_category text default null,
  p_city text default null,
  p_ids uuid[] default null,
  p_home_city text default null,
  p_limit int default 12,
  p_offset int default 0
)
returns table(event_id uuid, date_count bigint, last_date timestamptz, city_count bigint, home_dates bigint,
              in_home_city boolean, other_cities text[], other_city_count bigint, total_groups bigint)
language sql stable
as $$
  with params as (select lower(coalesce(p_city, p_home_city)) as home),
  base as (
    select e.id, e.start_date, e.venue_id, e.venue_city,
      (params.home is not null and lower(e.venue_city) = params.home) as in_city,
      coalesce(
        (select ea.artist_id::text from public.event_artists ea where ea.event_id = e.id and ea.is_headliner order by ea."order" asc nulls last limit 1),
        e.venue_id::text) || ':' || lower(regexp_replace(split_part(e.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as gkey
    from public.listed_events_with_venue e, params
    where e.start_date >= now()
      and e.status in ('upcoming', 'on_sale', 'sold_out')
      and (p_category is null or e.category::text = p_category)
      and (p_ids is null or e.id = any(p_ids))
  ), grouped as (
    select gkey,
      (array_agg(id order by in_city desc, start_date, id))[1] as event_id,
      (array_agg(start_date order by in_city desc, start_date, id))[1] as rep_date,
      max(start_date) as last_date,
      count(distinct (start_date at time zone 'Europe/London')::date) as date_count,
      count(distinct (start_date at time zone 'Europe/London')::date) filter (where in_city) as home_dates,
      count(distinct lower(venue_city)) as city_count,
      bool_or(in_city) as in_home_city,
      array_agg(venue_city order by start_date) filter (where not in_city) as oc_all
    from base group by gkey
    having (p_city is null or bool_or(in_city))
  ), tiles as (
    select g.*, count(*) over () as total_groups
    from grouped g
    order by g.rep_date, g.event_id
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  )
  select t.event_id, t.date_count, t.last_date, t.city_count, t.home_dates, t.in_home_city,
    coalesce((select array_agg(c order by o) from (select c, min(o) o from unnest(t.oc_all) with ordinality u(c, o) where c is not null group by c order by min(o) limit 4) s), '{}'::text[]) as other_cities,
    coalesce((select count(distinct lower(c)) from unnest(t.oc_all) c where c is not null), 0) as other_city_count,
    t.total_groups
  from tiles t
  order by t.rep_date, t.event_id
$$;
grant execute on function public.browse_show_tiles(text, text, uuid[], text, int, int) to anon, authenticated, service_role;

create or replace function public.show_dates(p_event_id uuid, p_limit int default 300)
returns table(id uuid, slug text, start_date timestamptz, status text, venue_name text, venue_city text)
language sql stable
as $$
  with me as (
    select e.id, e.venue_id,
      lower(regexp_replace(split_part(e.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as bt,
      (select ea.artist_id from public.event_artists ea where ea.event_id = e.id and ea.is_headliner order by ea."order" asc nulls last limit 1) as aid
    from public.events e where e.id = p_event_id
  )
  select x.id, x.slug, x.start_date, x.status::text, x.venue_name, x.venue_city
  from public.listed_events_with_venue x, me
  where x.start_date >= now()
    and x.status in ('upcoming', 'on_sale', 'sold_out')
    and lower(regexp_replace(split_part(x.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) = me.bt
    and ((me.aid is not null
          and (select ea2.artist_id from public.event_artists ea2 where ea2.event_id = x.id and ea2.is_headliner order by ea2."order" asc nulls last limit 1) = me.aid)
         or (me.aid is null and x.venue_id = me.venue_id
             and not exists (select 1 from public.event_artists ea3 where ea3.event_id = x.id and ea3.is_headliner)))
  order by x.start_date, x.id
  limit greatest(p_limit, 1)
$$;
grant execute on function public.show_dates(uuid, int) to anon, authenticated, service_role;
