-- Migration 003: Re-feature events using only verified s1.ticketm.net JPEG images
--
-- The migration_002 featured events happened to have images.universe.com URLs.
-- This migration re-selects featured events that have the standard Ticketmaster
-- TABLET_LANDSCAPE_16_9.jpg format (1024x576 JPEG) — a reliable, fast-loading URL.

-- Step 1: Clear current featured Ticketmaster events
UPDATE public.events
SET is_featured = false
WHERE is_featured = true
  AND ticketmaster_id IS NOT NULL;

-- Step 2: Feature 6 upcoming events with standard s1.ticketm.net JPEG images
-- Prefer TABLET_LANDSCAPE_16_9 format (1024x576), order by soonest date
UPDATE public.events
SET is_featured = true
WHERE id IN (
  SELECT id
  FROM public.events
  WHERE start_date > now()
    AND ticketmaster_id IS NOT NULL
    AND image_url LIKE '%s1.ticketm.net%'
    AND image_url LIKE '%TABLET_LANDSCAPE_16_9%'
    AND image_url LIKE '%.jpg'
  ORDER BY start_date ASC
  LIMIT 6
);
