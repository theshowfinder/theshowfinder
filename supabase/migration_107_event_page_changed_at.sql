-- Honest sitemap dates (3 Nov 2026). The nightly syncs touch ~32k of ~42k live events a day, so updated_at (the
-- sitemap's lastmod until now) said "changed today" for nearly every show and Google learned to ignore it.
-- page_changed_at records when what the page SHOWS last changed: set when take_changed_event_pages() sees the page
-- fingerprint move (a new show counts as changed when first seen). Starts at created_at for existing shows.
-- The fingerprint must ignore the new column, or every show would look "changed" (keeps today's hashes identical).
create or replace function public.event_page_fingerprint(e public.events) returns text
language sql immutable as $$
  select md5((to_jsonb(e) - array['updated_at', 'last_synced_at', 'gigsberg_inventory_checked_at', 'price_checked_at',
                                  'resale_checked_at', 'page_hash', 'created_at', 'page_changed_at'])::text)
$$;

alter table public.events add column if not exists page_changed_at timestamptz;
update public.events set page_changed_at = created_at where page_changed_at is null and start_date > now() - interval '1 day';

create or replace function public.take_changed_event_pages(max_rows int default 4000)
returns table(slug text, venue_slug text, artist_slugs text[])
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    select e.id, public.event_page_fingerprint(e) as h
    from public.events e
    where e.merged_into is null
      and e.start_date > now() - interval '1 day'
      and (e.page_hash is distinct from public.event_page_fingerprint(e) or e.start_date <= now())
    limit max_rows
  ), saved as (
    update public.events e set page_hash = c.h, page_changed_at = now()
    from changed c where e.id = c.id and e.page_hash is distinct from c.h returning e.id
  )
  select e.slug, v.slug,
         array(select a.slug from public.event_artists ea join public.artists a on a.id = ea.artist_id where ea.event_id = e.id and a.slug is not null)
  from changed c join public.events e on e.id = c.id left join public.venues v on v.id = e.venue_id;
end $$;

revoke all on function public.take_changed_event_pages(int) from public, anon, authenticated;
