-- Adds resumable city-by-city progress to the Gigsberg catalogue importer.
-- Existing catalogue rows are preserved; the importer advances this cursor
-- only after a city has completed successfully.
ALTER TABLE public.gigsberg_sync_state
  ADD COLUMN IF NOT EXISTS current_city_index INTEGER NOT NULL DEFAULT 0;

UPDATE public.gigsberg_sync_state
SET current_city_index = 0
WHERE current_city_index IS NULL;
