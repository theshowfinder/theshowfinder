-- Migration 101: a show with a Theatre Tickets Direct price but no other price uses it as its "from" price, so cards
-- everywhere (homepage West End strip, city pages, search) show it. See Tickets or a price typed in admin still win.
create or replace function public.refresh_ttd_links()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare linked int; cleared int; priced int; unpriced int;
begin
  with t as (
    select distinct on (show_key(name)) show_key(name) as k, merchant_url, price
    from ttd_catalogue
    where gone_at is null and coalesce(category, '') <> 'London Restaurants' and merchant_url is not null and length(show_key(name)) >= 3
    order by show_key(name), price nulls last
  ), e as (
    select ev.id, ev.category, v.name as venue, show_key(ev.title) as k
    from events ev join venues v on v.id = ev.venue_id
    where v.city ilike 'London' and ev.start_date > now() and ev.merged_into is null
  ), m as (
    select e.id, t.merchant_url, t.price
    from e join t on t.k = e.k
    where not (e.category = 'concert' and (select count(distinct e2.venue) from e e2 where e2.k = e.k) > 1)
  ), upd as (
    update events ev set ttd_url = m.merchant_url, ttd_price = m.price
    from m where ev.id = m.id and (ev.ttd_url is distinct from m.merchant_url or ev.ttd_price is distinct from m.price)
    returning 1
  ) select count(*) into linked from upd;

  with gone as (
    update events ev set ttd_url = null, ttd_price = null
    where ev.ttd_url is not null
      and not exists (select 1 from ttd_catalogue c where c.merchant_url = ev.ttd_url and c.gone_at is null)
    returning 1
  ) select count(*) into cleared from gone;

  with p as (
    update events ev set price_from = ev.ttd_price, price_to = null, price_source = 'Theatre Tickets Direct', price_checked_at = now()
    where ev.ttd_price is not null and not ev.price_manual
      and (ev.price_source is null or ev.price_source = 'Theatre Tickets Direct')
      and (ev.price_from is distinct from ev.ttd_price or ev.price_source is distinct from 'Theatre Tickets Direct')
    returning 1
  ) select count(*) into priced from p;

  with u as (
    update events ev set price_from = null, price_to = null, price_source = null, price_checked_at = null
    where ev.price_source = 'Theatre Tickets Direct' and ev.ttd_price is null and not ev.price_manual
    returning 1
  ) select count(*) into unpriced from u;

  return jsonb_build_object('linked', linked, 'cleared', cleared, 'priced', priced, 'unpriced', unpriced);
end;
$$;
revoke all on function public.refresh_ttd_links() from public, anon, authenticated;
grant execute on function public.refresh_ttd_links() to service_role;
