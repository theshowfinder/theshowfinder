-- Migration 097: prices on show pages from the sellers that share them.
--   Face value: the See Tickets feed (a primary seller) for every show matched to it, so Ticketmaster shows of the
--     same event get a price guide too. Ticketmaster's own data has no UK prices.
--   Resale: Gigsberg's lowest listed price, only while our stock check says tickets are listed.
-- A price typed in admin (price_manual) is never overwritten. refresh_event_prices() runs from the refresh-listings
-- job twice a day; a See Tickets / Gigsberg price that no longer applies is cleared.
alter table public.events
  add column if not exists price_source      text,
  add column if not exists price_checked_at  timestamptz,
  add column if not exists price_manual      boolean not null default false,
  add column if not exists resale_from       numeric,
  add column if not exists resale_source     text,
  add column if not exists resale_checked_at timestamptz;

create or replace function public.refresh_event_prices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  face_set int; face_cleared int; resale_set int; resale_cleared int;
begin
  with n as (
    select matched_event_id as id,
      case when min_price::text ~ '^[0-9]+(\.[0-9]+)?$' then min_price::text::numeric end as mn,
      case when search_price::text ~ '^[0-9]+(\.[0-9]+)?$' then search_price::text::numeric end as sp,
      case when max_price::text ~ '^[0-9]+(\.[0-9]+)?$' then max_price::text::numeric end as mx
    from see_tickets_catalogue_events
    where matched_event_id is not null and gone_at is null
      and match_status in ('auto_matched', 'approved_existing', 'approved_new')
  ), st as (
    select id, min(coalesce(case when mn >= 3 then mn end, case when sp >= 3 then sp end)) as lo, max(case when mx >= 3 then mx end) as hi
    from n group by id
  ), upd as (
    update events e set
      price_from = st.lo,
      price_to = case when st.hi > st.lo then st.hi end,
      price_source = 'See Tickets',
      price_checked_at = now()
    from st
    where e.id = st.id and st.lo is not null and not e.price_manual
      and (e.price_from is distinct from st.lo or e.price_to is distinct from (case when st.hi > st.lo then st.hi end) or e.price_source is distinct from 'See Tickets' or e.price_checked_at < now() - interval '20 hours')
    returning 1
  ) select count(*) into face_set from upd;

  with gone as (
    update events e set price_from = null, price_to = null, price_source = null, price_checked_at = null
    where e.price_source = 'See Tickets' and not e.price_manual
      and not exists (select 1 from see_tickets_catalogue_events c where c.matched_event_id = e.id and c.gone_at is null
                      and c.match_status in ('auto_matched', 'approved_existing', 'approved_new'))
    returning 1
  ) select count(*) into face_cleared from gone;

  with gb as (
    select matched_event_id as id, min(min_price::text::numeric) as lo
    from gigsberg_catalogue_events
    where matched_event_id is not null and gone_at is null and inventory_status = 'available'
      and match_status in ('auto_matched', 'approved_existing', 'approved_new')
      and min_price::text ~ '^[0-9]+(\.[0-9]+)?$' and min_price::text::numeric >= 3
    group by matched_event_id
  ), upd as (
    update events e set resale_from = gb.lo, resale_source = 'Gigsberg', resale_checked_at = now()
    from gb
    where e.id = gb.id and (e.resale_from is distinct from gb.lo or e.resale_checked_at < now() - interval '20 hours')
    returning 1
  ) select count(*) into resale_set from upd;

  with gone as (
    update events e set resale_from = null, resale_source = null, resale_checked_at = null
    where e.resale_source = 'Gigsberg'
      and not exists (select 1 from gigsberg_catalogue_events c where c.matched_event_id = e.id and c.gone_at is null
                      and c.inventory_status = 'available' and c.match_status in ('auto_matched', 'approved_existing', 'approved_new'))
    returning 1
  ) select count(*) into resale_cleared from gone;

  return jsonb_build_object('faceSet', face_set, 'faceCleared', face_cleared, 'resaleSet', resale_set, 'resaleCleared', resale_cleared);
end;
$$;

revoke all on function public.refresh_event_prices() from public, anon, authenticated;
grant execute on function public.refresh_event_prices() to service_role;
