-- Migration 007: extend artists table for artist pages, add tours and tour_dates

-- Extend the existing artists table (originally for event_artists relations)
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS tour_name    text,
  ADD COLUMN IF NOT EXISTS onsale_date  timestamptz,
  ADD COLUMN IF NOT EXISTS tickets_url  text,
  ADD COLUMN IF NOT EXISTS is_featured  boolean NOT NULL DEFAULT false;

-- Tours (one per artist, extensible to many)
CREATE TABLE IF NOT EXISTS public.tours (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id   uuid        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  tour_name   text        NOT NULL,
  onsale_date timestamptz,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Individual show dates within a tour
CREATE TABLE IF NOT EXISTS public.tour_dates (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id    uuid        NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  date       timestamptz NOT NULL,
  venue_name text        NOT NULL,
  city       text        NOT NULL,
  status     text        NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tours_artist_idx      ON public.tours      (artist_id);
CREATE INDEX IF NOT EXISTS tour_dates_tour_idx   ON public.tour_dates (tour_id);
CREATE INDEX IF NOT EXISTS tour_dates_date_idx   ON public.tour_dates (date);

ALTER TABLE public.tours      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tours"      ON public.tours      FOR SELECT USING (true);
CREATE POLICY "Public read tour_dates" ON public.tour_dates FOR SELECT USING (true);
