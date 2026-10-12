-- Adds venue_slug to events_with_venue.
--
-- src/lib/types/database.ts has always declared venue_slug on this view, and
-- EventCard links "📍 Venue, City" to /venues/<slug> when it is present — but the
-- view never selected it, so those venue links never rendered. Every venue has
-- a slug (0 of 1,811 without one), so this turns the links on site-wide with no
-- code change. The new column is appended last, which CREATE OR REPLACE VIEW
-- allows; security_invoker is kept as it was.

create or replace view public.events_with_venue
with (security_invoker = true) as
select
  e.id,
  e.title,
  e.slug,
  e.description,
  e.category,
  e.start_date,
  e.end_date,
  e.image_url,
  e.price_from,
  e.price_to,
  e.currency,
  e.tickets_url,
  e.status,
  e.is_featured,
  e.onsale_date,
  e.public_onsale_start,
  e.public_onsale_end,
  e.presale_start,
  e.presale_end,
  e.presale_name,
  e.on_sale_this_week,
  e.presale_this_week,
  e.upcoming_presale,
  e.newly_announced,
  e.last_synced_at,
  v.id       as venue_id,
  v.name     as venue_name,
  v.city     as venue_city,
  v.postcode as venue_postcode,
  v.capacity as venue_capacity,
  v.slug     as venue_slug
from public.events e
join public.venues v on v.id = e.venue_id;
