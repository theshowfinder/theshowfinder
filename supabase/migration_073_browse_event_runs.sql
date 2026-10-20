-- Already applied to the live database (migration "browse_event_runs").
-- One row per show (a run at a venue, or a whole tour) for the /events browse list.
-- Group key: headline artist (else the venue) + the title before " - ", so
-- "The Traitors - Green Performance" and "The Traitors - Yellow Performance" are one show and a tour is one show.
-- Returns the earliest upcoming date's event id, how many dates, the last date, how many venues, and the total shows.
create or replace function public.browse_event_runs(
  p_category text default null,
  p_city text default null,
  p_ids uuid[] default null,
  p_limit int default 12,
  p_offset int default 0
)
returns table(event_id uuid, run_size bigint, date_count bigint, last_date timestamptz, venue_count bigint, total_groups bigint)
language sql stable
as $$
  with base as (
    select e.id, e.start_date, e.venue_id,
      coalesce(
        (select ea.artist_id::text from public.event_artists ea where ea.event_id = e.id and ea.is_headliner order by ea."order" asc nulls last limit 1),
        e.venue_id::text) || ':' || lower(regexp_replace(split_part(e.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as gkey
    from public.listed_events_with_venue e
    where e.start_date >= now()
      and e.status in ('upcoming', 'on_sale', 'sold_out')
      and (p_category is null or e.category::text = p_category)
      and (p_city is null or e.venue_city = p_city)
      and (p_ids is null or e.id = any(p_ids))
  ), grouped as (
    select gkey,
      min(start_date) as first_date,
      max(start_date) as last_date,
      count(*) as run_size,
      count(distinct (start_date at time zone 'Europe/London')::date) as date_count,
      count(distinct venue_id) as venue_count,
      (array_agg(id order by start_date, id))[1] as event_id
    from base group by gkey
  )
  select g.event_id, g.run_size, g.date_count, g.last_date, g.venue_count, count(*) over () as total_groups
  from grouped g
  order by g.first_date, g.event_id
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$$;
grant execute on function public.browse_event_runs(text, text, uuid[], int, int) to anon, authenticated, service_role;
