-- Already applied to the live database (migration "health_city_staleness_ticketmaster_only").
-- The per-city staleness table is about Ticketmaster refreshes (sweep + main sync). Events from other sources
-- (council listings, Gigsberg, See Tickets) never set last_synced_at, so they all looked "stale" (24% of Derby).
-- Count only Ticketmaster-sourced events here; the other sources get their own freshness checks.
create or replace function public.health_city_staleness()
 returns table(city text, future_events bigint, stale_14d bigint, stale_30d bigint, stale_60d bigint)
 language sql stable
 set search_path to 'public'
as $function$
  select v.city,
         count(*),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '14 days'),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '30 days'),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '60 days')
  from events e join venues v on v.id = e.venue_id
  where e.start_date >= now() and e.status in ('upcoming', 'on_sale', 'sold_out')
    and e.ticketmaster_id is not null and e.source is null
  group by v.city
  order by 2 desc
$function$;
