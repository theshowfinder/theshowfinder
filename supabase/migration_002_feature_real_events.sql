-- Migration 002: Feature real Ticketmaster events for the homepage
--
-- The seed data has is_featured = true but no image_url.
-- This migration un-features those placeholder events and instead
-- features the 6 soonest upcoming Ticketmaster events that have images.

-- Step 1: Un-feature seed data events (they have no ticketmaster_id and no images)
UPDATE public.events
SET is_featured = false
WHERE ticketmaster_id IS NULL;

-- Step 2: Feature 6 upcoming Ticketmaster events that have real images
UPDATE public.events
SET is_featured = true
WHERE id IN (
  SELECT id
  FROM public.events
  WHERE start_date > now()
    AND image_url IS NOT NULL
    AND ticketmaster_id IS NOT NULL
  ORDER BY start_date ASC
  LIMIT 6
);
