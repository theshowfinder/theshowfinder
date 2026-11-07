-- 7 Nov 2026: show_dates() was a third of the database's CPU (Supabase high-CPU warning). It ran a regexp over every
-- upcoming listed event on every call (~1 s each, 87k calls). Same rules and result, but it now only looks at that
-- act's own shows (by headline artist), or that venue's shows when there is no artist. Checked against the old
-- function on a random sample: identical results.
create or replace function public.show_dates(p_event_id uuid, p_limit integer default 300)
returns table(id uuid, slug text, start_date timestamp with time zone, status text, venue_name text, venue_city text)
language sql stable
as $function$
  with me as (
    select e.id, e.venue_id,
      lower(regexp_replace(split_part(e.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as bt,
      (select ea.artist_id from public.event_artists ea where ea.event_id = e.id and ea.is_headliner order by ea."order" asc nulls last limit 1) as aid
    from public.events e where e.id = p_event_id
  ), cand as (
    select ea.event_id as id from public.event_artists ea, me where me.aid is not null and ea.artist_id = me.aid and ea.is_headliner
    union
    select e.id from public.events e, me where me.aid is null and e.venue_id = me.venue_id and e.start_date >= now()
  ), x as (
    select x.*, lower(regexp_replace(split_part(x.title, ' - ', 1), '[^a-zA-Z0-9]+', '', 'g')) as xbt
    from public.listed_events_with_venue x
    where x.id in (select id from cand) and x.start_date >= now() and x.status in ('upcoming', 'on_sale', 'sold_out')
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
