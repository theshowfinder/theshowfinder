-- Fix for 119 (13 Nov 2026): the page fingerprint is the whole row minus bookkeeping columns, and 119 added list_hash
-- without excluding it, so filling list_hash made every upcoming show (43,930) look "changed". The fingerprint now
-- ignores list_hash, and today's fingerprints are recorded so nothing rebuilds for that reason.
-- Also: a show that has just finished drops off its venue and artist lists once (finished in the last 14 hours, so
-- one of the two daily runs), not on every run for a day.
create or replace function public.event_page_fingerprint(e public.events) returns text
language sql immutable as $$
  select md5((to_jsonb(e) - array['updated_at', 'last_synced_at', 'gigsberg_inventory_checked_at', 'price_checked_at',
                                  'resale_checked_at', 'page_hash', 'created_at', 'page_changed_at', 'list_hash'])::text)
$$;

update public.events e set page_hash = public.event_page_fingerprint(e)
where e.merged_into is null and e.start_date > now() - interval '1 day';

create or replace function public.take_changed_event_pages(max_rows int default 1000)
returns table(slug text, venue_slug text, artist_slugs text[], list_changed boolean)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    select e.id, public.event_page_fingerprint(e) as h, public.event_list_fingerprint(e) as lh,
           (e.list_hash is distinct from public.event_list_fingerprint(e) or e.start_date between now() - interval '14 hours' and now()) as lc
    from public.events e
    where e.merged_into is null
      and e.start_date > now() - interval '1 day'
      and (e.page_hash is distinct from public.event_page_fingerprint(e) or e.start_date between now() - interval '14 hours' and now())
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
