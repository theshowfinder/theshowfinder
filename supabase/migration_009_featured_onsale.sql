-- Migration 009: add featured_onsale flag to artists
-- Controls which artists appear in On Sale This Week sections

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS featured_onsale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS artists_featured_onsale_idx ON public.artists (featured_onsale) WHERE featured_onsale = true;
