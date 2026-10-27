-- Compatibility migration for preview databases whose older artist-directory migration
-- was not replayed before the security-invoker migration.
create or replace view public.artists_with_upcoming as
select
  a.id,
  a.name,
  a.slug,
  a.image_url,
  a.genre,
  count(distinct e.id)::int as upcoming_count,
  min(e.start_date) as next_date
from public.artists a
join public.event_artists ea on ea.artist_id = a.id
join public.events e on e.id = ea.event_id
where e.start_date >= now()
  and e.status in ('upcoming', 'on_sale', 'sold_out')
group by a.id;

grant select on public.artists_with_upcoming to anon, authenticated;
