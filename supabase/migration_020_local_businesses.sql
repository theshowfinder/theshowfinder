-- migration_020_local_businesses.sql
-- Local business listings for each city page's "Local Guide" section —
-- restaurants, bars, hotels, transport near the big venues. This is the one
-- genuinely manual piece of this feature (no API for paid local ad
-- placements), added via the admin panel at /admin/local-businesses.
-- is_sponsored marks a paid placement for when local ad sales start.
-- is_lusso_client flags businesses that are Lusso Digital clients, so they
-- can be featured here as a value-add/exposure perk independent of paid
-- sponsorship. Sponsored listings always sort first within a city, then
-- display_order.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS public.local_businesses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city             text NOT NULL,
  name             text NOT NULL,
  category         text NOT NULL CHECK (category IN ('restaurant', 'bar', 'hotel', 'transport', 'other')),
  description      text,
  website_url      text,
  is_sponsored     boolean NOT NULL DEFAULT false,
  is_lusso_client  boolean NOT NULL DEFAULT false,
  display_order    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_businesses_city_idx ON public.local_businesses (city);

ALTER TABLE public.local_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Local businesses are publicly readable" ON public.local_businesses;

CREATE POLICY "Local businesses are publicly readable"
  ON public.local_businesses FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy — only the service role (used by the admin
-- panel) can write, matching the pattern used for artists/events/venues.
