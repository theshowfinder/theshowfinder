-- Ticketmaster's Discovery API caps a single query at six pages. Track the
-- current bounded date window within each city so every 24-month horizon is
-- covered without silently dropping long-range events.
ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS current_band_index INTEGER NOT NULL DEFAULT 0;

-- Restart the queue from London and the first 90-day window after deploying
-- the new importer. Upserts make this safe even if earlier broad imports ran.
UPDATE public.sync_state
SET current_city_index = 0,
    current_band_index = 0,
    status = 'idle';
