-- Pages rebuild only when what they show changes (30 Oct 2026, Vercel cost). The syncs touch ~32k of ~42k live
-- events every day (last_synced_at, *_checked_at), so updated_at cannot say what really changed. page_hash is a
-- fingerprint of the row without those bookkeeping columns; take_changed_event_pages() returns the events whose
-- fingerprint moved since the last call (plus shows that just finished), records the new fingerprint, and the
-- refresh-listings job rebuilds only those event pages and their artist and venue pages.
alter table public.events add column if not exists page_hash text;

create or replace function public.event_page_fingerprint(e public.events) returns text
language sql immutable as $$
  select md5((to_jsonb(e) - array['updated_at', 'last_synced_at', 'gigsberg_inventory_checked_at', 'price_checked_at',
                                  'resale_checked_at', 'page_hash', 'created_at'])::text)
$$;

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
    update public.events e set page_hash = c.h from changed c where e.id = c.id and e.page_hash is distinct from c.h returning e.id
  )
  select e.slug, v.slug,
         array(select a.slug from public.event_artists ea join public.artists a on a.id = ea.artist_id where ea.event_id = e.id and a.slug is not null)
  from changed c join public.events e on e.id = c.id left join public.venues v on v.id = e.venue_id;
end $$;

revoke all on function public.take_changed_event_pages(int) from public, anon, authenticated;

-- Today's fingerprints, so the first run does not rebuild every page.
update public.events e set page_hash = public.event_page_fingerprint(e)
where e.merged_into is null and e.start_date > now() - interval '1 day';

-- Event pages carry the "Make a night of it" local business box, so any change to a city's advertisers marks
-- that city's event pages as changed: they are rebuilt on the next refresh-listings run (05:50 / 14:45 UK).
create or replace function public.mark_city_event_pages_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.events e set page_hash = null
  from public.venues v
  where v.id = e.venue_id and v.city in (coalesce(new.city, old.city), coalesce(old.city, new.city))
    and e.merged_into is null and e.start_date > now() and e.page_hash is not null;
  return null;
end $$;

drop trigger if exists local_businesses_mark_pages on public.local_businesses;
create trigger local_businesses_mark_pages
  after insert or update or delete on public.local_businesses
  for each row execute function public.mark_city_event_pages_changed();
