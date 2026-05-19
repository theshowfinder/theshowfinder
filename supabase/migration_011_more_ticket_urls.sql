-- Migration 011: add Eventim, AXS and Gigantic primary ticket URL columns

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS eventim_url  text,
  ADD COLUMN IF NOT EXISTS axs_url      text,
  ADD COLUMN IF NOT EXISTS gigantic_url text;
