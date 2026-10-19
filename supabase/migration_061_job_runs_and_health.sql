-- Job run history + health helpers (admin only; service role).
create table if not exists public.job_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'ok', 'error')),
  http_status integer,
  summary     jsonb,
  error       text
);
create index if not exists job_runs_job_started_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;
revoke all on sequence public.job_runs_id_seq from anon, authenticated;

-- How stale the future listings are, per city.
create or replace function public.health_city_staleness()
returns table (city text, future_events bigint, stale_14d bigint, stale_30d bigint, stale_60d bigint)
language sql stable security invoker set search_path = public
as $$
  select v.city,
         count(*),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '14 days'),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '30 days'),
         count(*) filter (where e.last_synced_at is null or e.last_synced_at < now() - interval '60 days')
  from events e join venues v on v.id = e.venue_id
  where e.start_date >= now() and e.status in ('upcoming', 'on_sale', 'sold_out')
  group by v.city
  order by 2 desc
$$;
revoke execute on function public.health_city_staleness() from public, anon, authenticated;
grant execute on function public.health_city_staleness() to service_role;

-- Database load snapshot.
create or replace function public.health_db_stats()
returns table (max_connections integer, connections integer, active_connections integer, db_size_bytes bigint)
language sql stable security definer set search_path = public
as $$
  select (select setting::integer from pg_settings where name = 'max_connections'),
         (select count(*)::integer from pg_stat_activity),
         (select count(*)::integer from pg_stat_activity where state = 'active'),
         pg_database_size(current_database())
$$;
revoke execute on function public.health_db_stats() from public, anon, authenticated;
grant execute on function public.health_db_stats() to service_role;
