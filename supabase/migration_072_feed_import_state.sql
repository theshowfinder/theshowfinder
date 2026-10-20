-- Already applied to the live database (migration "feed_import_state").
-- Switch for the automatic import of shows that Gigsberg / See Tickets list but we do not have (one row, id = 1).
-- mode: 'off' = does nothing, 'dry' = finds and counts what it would import, writes nothing, 'live' = creates the events.
-- Starts in 'dry'. Admin/service role only.
create table if not exists public.feed_import_state (
  id               integer primary key default 1 check (id = 1),
  mode             text not null default 'dry' check (mode in ('off', 'dry', 'live')),
  max_per_run      integer not null default 150,
  last_stats       jsonb
);
insert into public.feed_import_state (id) values (1) on conflict (id) do nothing;
alter table public.feed_import_state enable row level security;
revoke all on public.feed_import_state from anon, authenticated;
