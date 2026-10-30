-- Show cards can say "Resale from £X" when Gigsberg has tickets listed (30 Oct 2026). Both listing views gain
-- two columns at the end (create or replace keeps existing columns, grants and dependants as they are).
create or replace view public.events_with_venue as
 select e.id, e.title, e.slug, e.description, e.category, e.start_date, e.end_date, e.image_url, e.price_from,
    e.price_to, e.currency, e.tickets_url, e.status, e.is_featured, e.onsale_date, e.public_onsale_start,
    e.public_onsale_end, e.presale_start, e.presale_end, e.presale_name, e.on_sale_this_week, e.presale_this_week,
    e.upcoming_presale, e.newly_announced, e.last_synced_at, v.id as venue_id, v.name as venue_name,
    v.city as venue_city, v.postcode as venue_postcode, v.capacity as venue_capacity, v.slug as venue_slug,
    e.resale_from, e.gigsberg_inventory_status
   from public.events e
     join public.venues v on v.id = e.venue_id;

create or replace view public.listed_events_with_venue as
 select ewv.id, ewv.title, ewv.slug, ewv.description, ewv.category, ewv.start_date, ewv.end_date, ewv.image_url,
    ewv.price_from, ewv.price_to, ewv.currency, ewv.tickets_url, ewv.status, ewv.is_featured, ewv.onsale_date,
    ewv.public_onsale_start, ewv.public_onsale_end, ewv.presale_start, ewv.presale_end, ewv.presale_name,
    ewv.on_sale_this_week, ewv.presale_this_week, ewv.upcoming_presale, ewv.newly_announced, ewv.last_synced_at,
    ewv.venue_id, ewv.venue_name, ewv.venue_city, ewv.venue_postcode, ewv.venue_capacity, ewv.venue_slug,
    ewv.resale_from, ewv.gigsberg_inventory_status
   from public.events_with_venue ewv
     left join public.event_canonical_map m on m.id = ewv.id
  where m.id is null or m.is_canonical;

grant select, insert, update, delete on public.events_with_venue to service_role;
grant select, insert, update, delete on public.listed_events_with_venue to service_role;
grant select on public.events_with_venue to anon, authenticated;
grant select on public.listed_events_with_venue to anon, authenticated;
