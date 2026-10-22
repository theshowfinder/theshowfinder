-- Feed import mode per feed (null = follow feed_import_state.mode), so Gigsberg can go live while See Tickets stays
-- in dry run until its pictures are sorted. Applied live 22 Oct 2026.
alter table public.feed_import_state add column if not exists gigsberg_mode text check (gigsberg_mode in ('off','dry','live'));
alter table public.feed_import_state add column if not exists see_tickets_mode text check (see_tickets_mode in ('off','dry','live'));

-- Rollout (22 Oct 2026): Gigsberg live, See Tickets dry run, up to 300 new pages per feed per daily run.
update public.feed_import_state set gigsberg_mode = 'live', see_tickets_mode = 'dry', max_per_run = 300 where id = 1;
