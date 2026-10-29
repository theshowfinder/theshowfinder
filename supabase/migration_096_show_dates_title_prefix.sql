-- Migration 096: "Other dates" on a show page found only shows with exactly the same title, so one tour listed as
-- "Ricky Gervais" on some dates and "Ricky Gervais: Legend" on others showed 7 of its 18 dates (29 Oct 2026).
-- Same headline act + one title being the other plus extra words (the act name vs the tour name) now count as the
-- same show. Two different shows by one act ("Phil Wang: Uh Oh" / "Phil Wang: Wang in There, Baby!") stay apart,
-- because neither title starts with the other.
create or replace function public.show_dates(p_event_id uuid, p_limit integer default 300)
returns table(id uuid, slug text, start_date timestamptz, status text, venue_name text, venue_city text)
language sql stable
as $function$
  with me as (
    select e.id, e.venue_id,
      lower(regexp_replace(split_part(e.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as bt,
      (select ea.artist_id from public.event_artists ea where ea.event_id = e.id and ea.is_headliner order by ea."order" asc nulls last limit 1) as aid
    from public.events e where e.id = p_event_id
  ), x as (
    select x.*, lower(regexp_replace(split_part(x.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as xbt
    from public.listed_events_with_venue x
    where x.start_date >= now() and x.status in ('upcoming', 'on_sale', 'sold_out')
  )
  select x.id, x.slug, x.start_date, x.status::text, x.venue_name, x.venue_city
  from x, me
  where (x.xbt = me.bt
         or (me.aid is not null and (left(x.xbt, length(me.bt)) = me.bt or left(me.bt, length(x.xbt)) = x.xbt)))
    and ((me.aid is not null
          and (select ea2.artist_id from public.event_artists ea2 where ea2.event_id = x.id and ea2.is_headliner order by ea2."order" asc nulls last limit 1) = me.aid)
         or (me.aid is null and x.venue_id = me.venue_id
             and not exists (select 1 from public.event_artists ea3 where ea3.event_id = x.id and ea3.is_headliner)))
  order by x.start_date, x.id
  limit greatest(p_limit, 1)
$function$;
