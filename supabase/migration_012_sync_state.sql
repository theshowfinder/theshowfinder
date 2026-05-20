-- Chunked sync state tracker (one row, id=1)
CREATE TABLE IF NOT EXISTS sync_state (
  id                   INTEGER PRIMARY KEY DEFAULT 1,
  current_city_index   INTEGER     DEFAULT 0,
  status               TEXT        DEFAULT 'idle',
  last_started_at      TIMESTAMPTZ,
  last_completed_at    TIMESTAMPTZ,
  total_events_synced  INTEGER     DEFAULT 0
);
INSERT INTO sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Per-city sync log
CREATE TABLE IF NOT EXISTS sync_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  city           TEXT,
  events_synced  INTEGER     DEFAULT 0,
  status         TEXT,
  error          TEXT
);
