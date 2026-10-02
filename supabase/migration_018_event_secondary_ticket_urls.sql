-- Exact event-level resale destinations. These must be listings for this
-- specific event, never provider homepages or generic search URLs.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS viagogo_url text,
  ADD COLUMN IF NOT EXISTS stubhub_url text,
  ADD COLUMN IF NOT EXISTS gigsberg_url text;
