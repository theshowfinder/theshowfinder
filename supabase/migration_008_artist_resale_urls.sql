-- Migration 008: add per-artist secondary market URLs

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS gigsberg_url   text,
  ADD COLUMN IF NOT EXISTS viagogo_url    text,
  ADD COLUMN IF NOT EXISTS stubhub_url    text,
  ADD COLUMN IF NOT EXISTS vivid_seats_url text;
