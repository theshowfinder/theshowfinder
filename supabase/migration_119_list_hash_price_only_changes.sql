-- Vercel bill (12 Nov 2026): ISR writes went from 10k to 2.1M units. Most "changed" shows only had a price move
-- (StubHub, See Tickets, Gigsberg, TTD prices change daily), yet each one also rebuilt its whole venue page (with its
-- /p/<n> pages) and artist page. list_hash fingerprints only what a venue or artist LIST shows (name, date, status,
-- venue, picture, category, on-sale dates); a price-only change now rebuilds just the event page, and venue and
-- artist pages take the new price on their weekly refresh.
alter table public.events add column if not exists list_hash text;

create or replace function public.event_list_fingerprint(e public.events) returns text
language sql immutable as $$
  select md5(concat_ws('|', e.title, e.slug, e.start_date, e.status, e.venue_id, e.category, e.image_url,
                       e.onsale_date, e.public_onsale_start, e.presale_start, e.merged_into))
$$;

drop function if exists public.take_changed_event_pages(int);
create function public.take_changed_event_pages(max_rows int default 1000)
returns table(slug text, venue_slug text, artist_slugs text[], list_changed boolean)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    select e.id, public.event_page_fingerprint(e) as h, public.event_list_fingerprint(e) as lh,
           (e.list_hash is distinct from public.event_list_fingerprint(e) or e.start_date <= now()) as lc
    from public.events e
    where e.merged_into is null
      and e.start_date > now() - interval '1 day'
      and (e.page_hash is distinct from public.event_page_fingerprint(e) or e.start_date <= now())
    limit max_rows
  ), saved as (
    update public.events e set page_hash = c.h, list_hash = c.lh, page_changed_at = now()
    from changed c where e.id = c.id and (e.page_hash is distinct from c.h or e.list_hash is distinct from c.lh) returning e.id
  )
  select e.slug, v.slug,
         array(select a.slug from public.event_artists ea join public.artists a on a.id = ea.artist_id where ea.event_id = e.id and a.slug is not null),
         c.lc
  from changed c join public.events e on e.id = c.id left join public.venues v on v.id = e.venue_id;
end $$;

revoke all on function public.take_changed_event_pages(int) from public, anon, authenticated;
grant execute on function public.take_changed_event_pages(int) to service_role;

-- Today's list fingerprints, so the first run does not treat every show as a list change.
update public.events e set list_hash = public.event_list_fingerprint(e)
where e.merged_into is null and e.start_date > now() - interval '1 day';
