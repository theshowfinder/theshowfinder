-- Daily-freshness measure for Ticketmaster listings, used by /admin/health and the alert job.
create or replace function public.health_tm_freshness()
returns table (future_tm bigint, stale_48h bigint, lap_completed boolean, lap_completed_at timestamptz)
language sql stable security invoker set search_path = public
as $$
  select
    (select count(*) from events e where e.ticketmaster_id is not null and e.source is null and e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out','postponed')),
    (select count(*) from events e where e.ticketmaster_id is not null and e.source is null and e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out','postponed') and (e.last_synced_at is null or e.last_synced_at < now() - interval '48 hours')),
    (select completed_cycle_started_at is not null from tm_sweep_state where id = 1),
    (select completed_at from tm_sweep_state where id = 1)
$$;
revoke execute on function public.health_tm_freshness() from public, anon, authenticated;
grant execute on function public.health_tm_freshness() to service_role;
