-- Already applied to the live database (migration "see_tickets_sweep_state").
-- Switches for the See Tickets feed sweep (one row, id = 1). Admin/service role only.
-- mode: 'off' = legacy behaviour only, 'dry' = legacy writes plus a report of what live mode would do, 'live' = also stamps every feed row
-- as seen and flags rows the feed has stopped listing. Starts in 'dry'.
create table if not exists public.see_tickets_sweep_state (
  id                   integer primary key default 1 check (id = 1),
  mode                 text not null default 'dry' check (mode in ('off', 'dry', 'live')),
  max_removals_per_run integer not null default 300,
  stamping_since       timestamptz,
  last_stats           jsonb
);
insert into public.see_tickets_sweep_state (id) values (1) on conflict (id) do nothing;
alter table public.see_tickets_sweep_state enable row level security;
revoke all on public.see_tickets_sweep_state from anon, authenticated;

-- A catalogue row the feed has stopped listing (absent on consecutive runs) is flagged, never deleted.
alter table public.see_tickets_catalogue_events add column if not exists gone_at timestamptz;
create index if not exists see_tickets_catalogue_future_idx
  on public.see_tickets_catalogue_events (event_date) where gone_at is null;
