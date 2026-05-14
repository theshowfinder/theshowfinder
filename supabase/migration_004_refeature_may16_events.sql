-- Migration 004: Re-feature events starting 16 May 2026 with exact TABLET_LANDSCAPE_16_9 JPEGs
--
-- Previous featured events (migration_003) all started on 14 May and are now past.
-- This migration selects events starting 16 May+ that have the exact
-- TABLET_LANDSCAPE_16_9.jpg format (not the LARGE 2048px variant).

-- Step 1: Clear all current featured Ticketmaster events
UPDATE public.events
SET is_featured = false
WHERE is_featured = true
  AND ticketmaster_id IS NOT NULL;

-- Step 2: Feature 6 upcoming events from 16 May with standard TABLET_LANDSCAPE_16_9 JPEG
-- Exclude the LARGE variant by requiring the URL does NOT contain 'LARGE'
UPDATE public.events
SET is_featured = true
WHERE id IN (
  SELECT id
  FROM public.events
  WHERE start_date > '2026-05-16T00:00:00Z'
    AND ticketmaster_id IS NOT NULL
    AND image_url LIKE '%s1.ticketm.net%'
    AND image_url LIKE '%TABLET_LANDSCAPE_16_9%'
    AND image_url NOT LIKE '%TABLET_LANDSCAPE_LARGE%'
    AND image_url LIKE '%.jpg'
  ORDER BY start_date ASC
  LIMIT 6
);
