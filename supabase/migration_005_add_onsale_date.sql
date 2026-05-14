-- Add onsale_date column to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS onsale_date timestamptz;

-- Recreate events_with_venue view to include onsale_date
CREATE OR REPLACE VIEW public.events_with_venue AS
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
  v.id   AS venue_id,
  v.name AS venue_name,
  v.city AS venue_city,
  v.postcode AS venue_postcode
FROM public.events e
JOIN public.venues v ON v.id = e.venue_id;
