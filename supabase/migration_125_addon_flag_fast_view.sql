-- Migration 125: make the public listing view fast again. Safe to re-run.
-- Migration 124 put the add-on rule (a set of regexes) inside listed_events_with_venue, so every
-- list, count and search re-ran it over ~45,000 titles (~350ms per query). That pushed the
-- /insights build step over its time limit and failed the 13 Nov deploy. Now the rule runs once,
-- when a listing is written, into events.is_addon, and the view just reads the flag.

alter table public.events add column if not exists is_addon boolean not null default false;

create or replace function public.events_set_is_addon() returns trigger
language plpgsql as $$
begin
  new.is_addon := public.is_listing_addon(new.title);
  return new;
end
$$;

drop trigger if exists events_set_is_addon on public.events;
create trigger events_set_is_addon before insert or update of title on public.events
  for each row execute function public.events_set_is_addon();

-- Existing listings (only the ones the rule catches, so this is a small write).
update public.events set is_addon = true where not is_addon and public.is_listing_addon(title);

create index if not exists events_is_addon_idx on public.events (id) where is_addon;

create or replace view public.listed_events_with_venue as
 SELECT ewv.id, ewv.title, ewv.slug, ewv.description, ewv.category, ewv.start_date, ewv.end_date, ewv.image_url,
    ewv.price_from, ewv.price_to, ewv.currency, ewv.tickets_url, ewv.status, ewv.is_featured, ewv.onsale_date,
    ewv.public_onsale_start, ewv.public_onsale_end, ewv.presale_start, ewv.presale_end, ewv.presale_name,
    ewv.on_sale_this_week, ewv.presale_this_week, ewv.upcoming_presale, ewv.newly_announced, ewv.last_synced_at,
    ewv.venue_id, ewv.venue_name, ewv.venue_city, ewv.venue_postcode, ewv.venue_capacity, ewv.venue_slug,
    ewv.resale_from, ewv.gigsberg_inventory_status
   FROM events_with_venue ewv
     LEFT JOIN event_canonical_map m ON m.id = ewv.id
  WHERE (m.id IS NULL OR m.is_canonical)
    AND NOT EXISTS (SELECT 1 FROM public.events x WHERE x.id = ewv.id AND x.is_addon)
    AND NOT EXISTS (SELECT 1 FROM public.listing_hides h WHERE h.event_id = ewv.id);
grant select on public.listed_events_with_venue to anon, authenticated, service_role;

-- When the rule in is_listing_addon() changes later, re-flag everything with:
--   update public.events set is_addon = public.is_listing_addon(title);
