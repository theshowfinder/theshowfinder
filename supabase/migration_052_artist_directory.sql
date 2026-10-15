-- Artist directory + artist profile info.
-- 1) Extra columns the nightly enrich-artists job fills (genre, links, short bio).
-- 2) A view of artists that have upcoming shows, with date counts, used by the
--    /artists directory and the artist cards in search results.

alter table public.artists
  add column if not exists bio_source    text,
  add column if not exists wikipedia_url text,
  add column if not exists social_links  jsonb,
  add column if not exists enriched_at   timestamptz;

create index if not exists artists_enriched_at_idx on public.artists (enriched_at nulls first);

create or replace view public.artists_with_upcoming as
select
  a.id,
  a.name,
  a.slug,
  a.image_url,
  a.genre,
  count(distinct e.id)::int as upcoming_count,
  min(e.start_date)         as next_date
from public.artists a
join public.event_artists ea on ea.artist_id = a.id
join public.events e         on e.id = ea.event_id
where e.start_date >= now()
  and e.status in ('upcoming', 'on_sale', 'sold_out')
group by a.id;

grant select on public.artists_with_upcoming to anon, authenticated;
