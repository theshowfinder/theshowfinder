-- Already applied to the live database (migration "council_sync_state").
-- Switches for dead-event removal in the council "what's on" sync (one row, id = 1). Admin/service role only.
-- mode: 'off' = legacy behaviour (no removal check), 'dry' = check and report, nothing removed, 'live' = cancel events the
-- council site has dropped (confirmed by a 404/410 on the event's own page). Starts in 'dry'.
create table if not exists public.council_sync_state (
  id                   integer primary key default 1 check (id = 1),
  mode                 text not null default 'dry' check (mode in ('off', 'dry', 'live')),
  max_removals_per_run integer not null default 20,
  last_stats           jsonb
);
insert into public.council_sync_state (id) values (1) on conflict (id) do nothing;
alter table public.council_sync_state enable row level security;
revoke all on public.council_sync_state from anon, authenticated;
