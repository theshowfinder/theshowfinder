-- Widens local_businesses.category beyond restaurant/bar/hotel/transport —
-- the "Local Guide" section was built food-and-drink-first, but the first
-- real listing (Acrylics by Amber, a Derby nail tech) needs a category that
-- actually fits. Adds 'beauty'; more can be added the same way as new kinds
-- of local listing come in.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

ALTER TABLE public.local_businesses DROP CONSTRAINT IF EXISTS local_businesses_category_check;

ALTER TABLE public.local_businesses
  ADD CONSTRAINT local_businesses_category_check
  CHECK (category IN ('restaurant', 'bar', 'hotel', 'transport', 'beauty', 'other'));
