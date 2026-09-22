-- migration_019_gigsberg_sync.sql
-- Adds tables for the daily Gigsberg ticket sync, which links Chris's own
-- live Gigsberg listings to matching events via events.own_ticket_url
-- (added in migration_018). Mirrors the sync_state/sync_log pattern used by
-- the Ticketmaster sync (migration_012), but as separate tables since the
-- per-city shape of sync_log/sync_state doesn't fit a single-pass run.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

-- Single-row run state tracker (id=1), same shape as sync_state.
CREATE TABLE IF NOT EXISTS gigsberg_sync_state (
  id                   INTEGER PRIMARY KEY DEFAULT 1,
  status               TEXT        DEFAULT 'idle',
  last_started_at      TIMESTAMPTZ,
  last_completed_at    TIMESTAMPTZ,
  total_listings_synced INTEGER    DEFAULT 0
);
INSERT INTO gigsberg_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- One row per sync run.
CREATE TABLE IF NOT EXISTS gigsberg_sync_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  listings_fetched  INTEGER     DEFAULT 0,
  events_matched    INTEGER     DEFAULT 0,
  events_updated    INTEGER     DEFAULT 0,
  events_unmatched  INTEGER     DEFAULT 0,
  events_cleared    INTEGER     DEFAULT 0,
  status            TEXT,
  error             TEXT
);

-- Tracks which events.own_ticket_url values were set BY THIS SYNC (as opposed
-- to entered manually via /admin/events), so a Gigsberg listing going
-- inactive/sold-out only clears the URL it set — never a manually-entered one.
CREATE TABLE IF NOT EXISTS gigsberg_event_links (
  event_id          UUID        PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  gigsberg_event_id TEXT        NOT NULL,
  ticket_url        TEXT        NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.gigsberg_sync_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gigsberg_sync_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gigsberg_event_links ENABLE ROW LEVEL SECURITY;
-- No policies needed on any of the three: service role bypasses RLS; all
-- other roles are denied, same as sync_state/sync_log (migration_016).
