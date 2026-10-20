-- Already applied to the live database (migration "gigsberg_sweep_state").
-- Cursor + switches for the national Gigsberg catalogue sweep (one row, id = 1). Admin/service role only.
-- mode: 'off' = does nothing, 'dry' = fetches and reports only, 'live' = writes and removes. Starts in 'dry'.
create table if not exists public.gigsberg_sweep_state (
  id                         integer primary key default 1 check (id = 1),
  city_index                 integer not null default 0,
  cycle_started_at           timestamptz,
  completed_at               timestamptz,
  completed_cycle_started_at timestamptz,
  running_since              timestamptz,
  last_stats                 jsonb,
  mode                       text not null default 'dry' check (mode in ('off', 'dry', 'live')),
  max_removals_per_run       integer not null default 50
);
insert into public.gigsberg_sweep_state (id) values (1) on conflict (id) do nothing;
alter table public.gigsberg_sweep_state enable row level security;
revoke all on public.gigsberg_sweep_state from anon, authenticated;

-- A catalogue row Gigsberg no longer lists (confirmed by a 404 on the event itself) is flagged, never deleted.
alter table public.gigsberg_catalogue_events add column if not exists gone_at timestamptz;
create index if not exists gigsberg_catalogue_future_seen_idx
  on public.gigsberg_catalogue_events (event_date, last_seen_at) where gone_at is null;
