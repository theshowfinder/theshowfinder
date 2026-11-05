-- Automatic outreach prospecting (cron outreach-find): every OpenStreetMap place we have already looked at,
-- so each run only checks new ones, plus one "run:<City>" row per city recording when it was last scanned.
create table if not exists outreach_scanned (
  key          text primary key,          -- 'node/123', 'way/456' or 'run:Manchester'
  city         text not null,
  website_host text,
  result       text,                      -- approved | to_check | no_email | fetch_failed | duplicate | run
  checked_at   timestamptz not null default now()
);
create index if not exists outreach_scanned_city_idx on outreach_scanned (city, checked_at desc);
alter table outreach_scanned enable row level security;   -- service role only
alter table outreach_prospects add column if not exists osm_key text;
