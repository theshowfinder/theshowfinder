-- migration_015_venue_slug_in_view.sql
-- Adds venue_slug to the events_with_venue view so components can build
-- /venues/[slug] links directly from event query results.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

DROP VIEW IF EXISTS public.events_with_venue CASCADE;

CREATE VIEW public.events_with_venue AS
SELECT
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
  v.id       AS venue_id,
  v.name     AS venue_name,
  v.slug     AS venue_slug,
  v.city     AS venue_city,
  v.postcode AS venue_postcode,
  v.capacity AS venue_capacity
FROM public.events e
JOIN public.venues v ON v.id = e.venue_id;
