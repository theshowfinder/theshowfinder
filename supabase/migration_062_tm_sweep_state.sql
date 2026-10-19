-- Cursor for the national Ticketmaster sweep (one row, id = 1). Admin/service role only.
create table if not exists public.tm_sweep_state (
  id                 integer primary key default 1 check (id = 1),
  segment_index      integer not null default 0,
  window_start       timestamptz,
  cycle_started_at   timestamptz,
  completed_at       timestamptz,
  completed_cycle_started_at timestamptz,
  running_since      timestamptz,
  last_stats         jsonb
);
insert into public.tm_sweep_state (id) values (1) on conflict (id) do nothing;
alter table public.tm_sweep_state enable row level security;
revoke all on public.tm_sweep_state from anon, authenticated;
