-- migration_014_sale_flags.sql
-- Adds per-event sale timing columns, boolean classification flags, and
-- a stored procedure for nightly flag recalculation.
--
-- Run in the Supabase SQL Editor:  Dashboard → SQL Editor → New query → Run

-- ─── 0. Drop existing view first (required before adding columns that change ─
--         column positions — CREATE OR REPLACE VIEW cannot reorder columns)   ─
DROP VIEW IF EXISTS public.events_with_venue CASCADE;

-- ─── 1. New columns on events ────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS public_onsale_start  timestamptz,
  ADD COLUMN IF NOT EXISTS public_onsale_end    timestamptz,
  ADD COLUMN IF NOT EXISTS presale_start        timestamptz,
  ADD COLUMN IF NOT EXISTS presale_end          timestamptz,
  ADD COLUMN IF NOT EXISTS presale_name         text,
  ADD COLUMN IF NOT EXISTS on_sale_this_week    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presale_this_week    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upcoming_presale     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newly_announced      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at       timestamptz;

-- ─── 2. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_on_sale_this_week_idx   ON public.events (on_sale_this_week)   WHERE on_sale_this_week  = true;
CREATE INDEX IF NOT EXISTS events_presale_this_week_idx   ON public.events (presale_this_week)   WHERE presale_this_week  = true;
CREATE INDEX IF NOT EXISTS events_upcoming_presale_idx    ON public.events (upcoming_presale)    WHERE upcoming_presale   = true;
CREATE INDEX IF NOT EXISTS events_newly_announced_idx     ON public.events (newly_announced)     WHERE newly_announced    = true;
CREATE INDEX IF NOT EXISTS events_public_onsale_start_idx ON public.events (public_onsale_start);
CREATE INDEX IF NOT EXISTS events_presale_start_idx       ON public.events (presale_start);

-- ─── 3. Stored procedure: reset then recalculate all boolean flags ────────────
-- Called by the nightly sync after all events are upserted so stale positives
-- are never left on events that no longer qualify.
CREATE OR REPLACE FUNCTION public.calculate_event_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Reset all flags to false in one pass
  UPDATE public.events
  SET
    on_sale_this_week = false,
    presale_this_week = false,
    upcoming_presale  = false,
    newly_announced   = false;

  -- on_sale_this_week: public sale opens within the next 7 days
  UPDATE public.events
  SET on_sale_this_week = true
  WHERE public_onsale_start >= v_now
    AND public_onsale_start <= v_now + INTERVAL '7 days';

  -- presale_this_week: a presale opens within the next 7 days
  UPDATE public.events
  SET presale_this_week = true
  WHERE presale_start >= v_now
    AND presale_start <= v_now + INTERVAL '7 days';

  -- upcoming_presale: a presale opens within the next 30 days
  UPDATE public.events
  SET upcoming_presale = true
  WHERE presale_start >= v_now
    AND presale_start <= v_now + INTERVAL '30 days';

  -- newly_announced: added in the last 7 days and tickets not yet on general sale
  UPDATE public.events
  SET newly_announced = true
  WHERE created_at >= v_now - INTERVAL '7 days'
    AND public_onsale_start > v_now;
END;
$$;

-- Allow the service role (used by cron) to call this function
GRANT EXECUTE ON FUNCTION public.calculate_event_flags() TO service_role;

-- ─── 4. Recreate events_with_venue to include all new fields + venue capacity ─
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
  v.city     AS venue_city,
  v.postcode AS venue_postcode,
  v.capacity AS venue_capacity
FROM public.events e
JOIN public.venues v ON v.id = e.venue_id;
