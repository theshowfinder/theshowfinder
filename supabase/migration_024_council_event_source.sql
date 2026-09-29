-- Adds source tracking to `events` for non-Ticketmaster event sources — the
-- first being Derby's council "what's on" sites (Derby Market Hall, Derby
-- LIVE), scraped from their own schema.org Event markup. Mirrors the
-- ticketmaster_id pattern: source_url is each event's canonical page on the
-- originating site, used as the upsert conflict target so a re-sync updates
-- the existing row instead of creating a duplicate every run.
alter table events add column if not exists source text;
alter table events add column if not exists source_url text;

create unique index if not exists events_source_url_key
  on events (source_url)
  where source_url is not null;

comment on column events.source is
  'Where a non-Ticketmaster event came from, e.g. ''derby_council''. Null for Ticketmaster-synced and hand-added events.';
comment on column events.source_url is
  'Canonical detail-page URL on the source site — the upsert key for re-syncing this event.';
