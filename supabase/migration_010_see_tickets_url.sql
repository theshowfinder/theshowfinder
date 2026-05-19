-- Migration 010: add See Tickets primary ticket provider URL to artists

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS see_tickets_url text;
