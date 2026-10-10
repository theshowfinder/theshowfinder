-- Migration 044: indexes for public event browsing and source coverage.
-- These indexes do not change rows or matching decisions; they reduce the
-- amount of data Postgres must scan as the catalogue grows.

CREATE INDEX IF NOT EXISTS events_live_venue_start_idx
  ON public.events (venue_id, start_date)
  WHERE status IN ('upcoming', 'on_sale', 'sold_out');

CREATE INDEX IF NOT EXISTS events_live_start_venue_idx
  ON public.events (start_date, venue_id)
  WHERE status IN ('upcoming', 'on_sale', 'sold_out');

CREATE INDEX IF NOT EXISTS events_live_onsale_start_idx
  ON public.events (onsale_date, start_date, venue_id)
  WHERE status IN ('upcoming', 'on_sale', 'sold_out');

CREATE INDEX IF NOT EXISTS event_artists_artist_event_idx
  ON public.event_artists (artist_id, event_id);

CREATE INDEX IF NOT EXISTS gigsberg_catalogue_city_date_idx
  ON public.gigsberg_catalogue_events (city, event_date);

CREATE INDEX IF NOT EXISTS gigsberg_catalogue_city_match_status_idx
  ON public.gigsberg_catalogue_events (city, match_status, event_date);
