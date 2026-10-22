-- Applied 22 Oct 2026: count affiliate-hop requests per UK hour (not just per day), for the hourly bot watch.
-- Column + primary key change on an existing table; no new table or view.
alter table public.outbound_click_daily add column if not exists hour smallint not null default 0;
alter table public.outbound_click_daily drop constraint if exists outbound_click_daily_pkey;
alter table public.outbound_click_daily add primary key (day, hour, provider, outcome, reason);

create or replace function public.bump_outbound_click(p_provider text, p_outcome text, p_reason text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.outbound_click_daily (day, hour, provider, outcome, reason, clicks)
  values ((now() at time zone 'Europe/London')::date, extract(hour from (now() at time zone 'Europe/London'))::smallint,
          p_provider, p_outcome, coalesce(p_reason, ''), 1)
  on conflict (day, hour, provider, outcome, reason) do update set clicks = outbound_click_daily.clicks + 1;
$$;
revoke execute on function public.bump_outbound_click(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_outbound_click(text, text, text) to service_role;
