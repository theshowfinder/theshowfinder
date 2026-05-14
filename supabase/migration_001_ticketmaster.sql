-- ============================================================
-- Migration 001: Ticketmaster sync support
-- Run this in Supabase SQL Editor BEFORE running the sync agent
-- ============================================================

-- Add Ticketmaster IDs for upsert deduplication
alter table public.events  add column if not exists ticketmaster_id text unique;
alter table public.venues  add column if not exists ticketmaster_id text unique;
alter table public.artists add column if not exists ticketmaster_id text unique;

-- Index for fast lookups during sync
create index if not exists events_ticketmaster_id_idx  on public.events  (ticketmaster_id);
create index if not exists venues_ticketmaster_id_idx  on public.venues  (ticketmaster_id);
create index if not exists artists_ticketmaster_id_idx on public.artists (ticketmaster_id);
