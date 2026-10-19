-- Staged rollout switches for the Ticketmaster sweep. Starts in 'dry' (reads Ticketmaster, writes nothing).
-- mode: 'off' = does nothing, 'dry' = fetches and reports only, 'live' = writes.
alter table public.tm_sweep_state add column if not exists mode text not null default 'dry' check (mode in ('off', 'dry', 'live'));
alter table public.tm_sweep_state add column if not exists max_removals_per_run integer not null default 100;
