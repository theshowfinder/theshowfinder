-- Daily counts of affiliate-hop requests (/out/<provider>) by outcome and reason, so the effect of the bot fixes can
-- be shown from our own data (Vercel runtime logs only keep a short window). Server-only: written by the hop through
-- bump_outbound_click(), read by admin/Claude. No personal data (no IPs, no user agents).
create table if not exists public.outbound_click_daily (
  day      date not null,
  provider text not null,
  outcome  text not null,            -- tracked | plain | invalid
  reason   text not null default '', -- '' for a normal tracked click; else why it was not tracked
  clicks   integer not null default 0,
  primary key (day, provider, outcome, reason)
);
alter table public.outbound_click_daily enable row level security;
revoke all on public.outbound_click_daily from anon, authenticated;
grant select, insert, update, delete on public.outbound_click_daily to service_role;

create or replace function public.bump_outbound_click(p_provider text, p_outcome text, p_reason text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.outbound_click_daily (day, provider, outcome, reason, clicks)
  values ((now() at time zone 'Europe/London')::date, p_provider, p_outcome, coalesce(p_reason, ''), 1)
  on conflict (day, provider, outcome, reason) do update set clicks = outbound_click_daily.clicks + 1;
$$;
revoke execute on function public.bump_outbound_click(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_outbound_click(text, text, text) to service_role;
