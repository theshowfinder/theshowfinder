-- Migration 100: Theatre Tickets Direct links on London theatre shows.
-- Their feed is one product per show (no dates or venue), so a London show is linked when its title is the same show
-- name after tidying ("SIX The Musical" = "Six", "Matilda the Musical" = "Matilda", "Oliver" = "Oliver!"). When one name
-- is used at two London venues and one of them is a concert (Nevermore the musical vs Nevermore the band), the
-- concert is left out. Runs from the refresh-listings job after the feed import.
alter table public.events
  add column if not exists ttd_url   text,
  add column if not exists ttd_price numeric;

create or replace function public.show_key(t text)
returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(regexp_replace(split_part(split_part(coalesce(t, ''), ' - ', 1), ':', 1),
    '^the\s+', '', 'i'), '\s+(the musical|musical|the play|live on stage|live)$', '', 'i'), '[^a-zA-Z0-9]+', '', 'g'))
$$;

create or replace function public.refresh_ttd_links()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare linked int; cleared int;
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

  return jsonb_build_object('linked', linked, 'cleared', cleared);
end;
$$;
revoke all on function public.refresh_ttd_links() from public, anon, authenticated;
grant execute on function public.refresh_ttd_links() to service_role;
