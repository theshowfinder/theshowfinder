-- Migration 130: paid tickets through TheShowFinder (Stripe Connect). The organiser is the seller: each sale is a
-- payment on the organiser's own Stripe account, and our booking fee (6% + 49p a ticket) comes to us as an
-- application fee. Organiser payouts are held until the day after the event. Safe to re-run.

-- Organisers: their Stripe account, and whether Chris has approved them for paid tickets (first paid event is checked).
alter table public.organisers add column if not exists stripe_account_id text;
alter table public.organisers add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.organisers add column if not exists stripe_payouts_enabled boolean not null default false;
alter table public.organisers add column if not exists stripe_details_submitted boolean not null default false;
alter table public.organisers add column if not exists paid_tickets_approved boolean not null default false;
create unique index if not exists organisers_stripe_account_idx on public.organisers (stripe_account_id) where stripe_account_id is not null;

-- A listing can sell paid tickets: one price, a number available.
alter table public.event_submissions add column if not exists paid_price_pence integer;
alter table public.event_submissions add column if not exists paid_capacity integer;
alter table public.event_submissions drop constraint if exists event_submissions_paid_check;
alter table public.event_submissions add constraint event_submissions_paid_check check (
  (paid_price_pence is null and paid_capacity is null) or (paid_price_pence between 100 and 100000 and paid_capacity between 1 and 10000));

-- Ticket types can be switched off (a paid type is only on sale once the organiser's Stripe account can take payments).
alter table public.ticket_types add column if not exists active boolean not null default true;
alter table public.ticket_types drop constraint if exists ticket_types_capacity_check;
alter table public.ticket_types add constraint ticket_types_capacity_check check (capacity > 0 and capacity <= 10000);
grant select (active) on public.ticket_types to anon, authenticated;

-- Orders: pending while the buyer is on the payment page (tickets held for 35 minutes), then confirmed or expired.
alter table public.ticket_orders add column if not exists ticket_price_pence integer not null default 0;
alter table public.ticket_orders add column if not exists stripe_account_id text;
alter table public.ticket_orders add column if not exists stripe_session_id text;
alter table public.ticket_orders add column if not exists stripe_payment_intent text;
alter table public.ticket_orders add column if not exists expires_at timestamptz;
alter table public.ticket_orders add column if not exists confirmed_at timestamptz;
alter table public.ticket_orders add column if not exists paid_out_at timestamptz;
alter table public.ticket_orders add column if not exists refunded_at timestamptz;
alter table public.ticket_orders drop constraint if exists ticket_orders_status_check;
alter table public.ticket_orders add constraint ticket_orders_status_check check (status in ('pending', 'confirmed', 'expired', 'cancelled', 'refunded'));
create unique index if not exists ticket_orders_session_idx on public.ticket_orders (stripe_session_id) where stripe_session_id is not null;
create index if not exists ticket_orders_pending_idx on public.ticket_orders (ticket_type_id, expires_at) where status = 'pending';

-- Hold paid tickets while the buyer pays. Expired holds on this ticket type are released first.
create or replace function public.reserve_paid_tickets(p_type uuid, p_name text, p_email text, p_qty integer)
returns table (order_id uuid, access_token text, unit_price integer, unit_fee integer, stripe_account text)
language plpgsql security definer set search_path = public as $$
declare
  t public.ticket_types;
  o public.ticket_orders;
  acct text;
  released integer;
  had integer;
  fee integer;
begin
  if p_qty is null or p_qty < 1 then raise exception 'bad_quantity'; end if;
  select * into t from public.ticket_types where id = p_type for update;
  if not found or not t.active then raise exception 'not_found'; end if;
  if t.price_pence <= 0 then raise exception 'not_paid'; end if;
  if p_qty > t.max_per_order then raise exception 'too_many'; end if;
  if (t.sales_start is not null and now() < t.sales_start) or (t.sales_end is not null and now() > t.sales_end) then raise exception 'not_on_sale'; end if;
  if exists (select 1 from public.events e where e.id = t.event_id and (e.start_date < now() - interval '2 hours' or e.status in ('cancelled', 'postponed'))) then raise exception 'not_on_sale'; end if;
  select org.stripe_account_id into acct from public.events e join public.organisers org on org.id = e.organiser_id
    where e.id = t.event_id and org.stripe_charges_enabled;
  if acct is null then raise exception 'not_on_sale'; end if;

  with gone as (
    update public.ticket_orders set status = 'expired'
    where ticket_type_id = p_type and status = 'pending' and expires_at < now() returning quantity
  ) select coalesce(sum(quantity), 0) into released from gone;
  if released > 0 then t.sold := greatest(t.sold - released, 0); end if;

  select coalesce(sum(quantity), 0) into had from public.ticket_orders
    where event_id = t.event_id and buyer_email = lower(p_email) and status in ('confirmed', 'pending');
  if had + p_qty > t.max_per_order then raise exception 'already_have'; end if;
  if t.sold + p_qty > t.capacity then raise exception 'sold_out'; end if;

  fee := round(t.price_pence * 0.06) + 49;
  update public.ticket_types set sold = t.sold + p_qty where id = p_type;
  insert into public.ticket_orders (event_id, ticket_type_id, buyer_name, buyer_email, quantity, ticket_price_pence, fee_pence, total_pence, status, stripe_account_id, expires_at)
    values (t.event_id, p_type, p_name, lower(p_email), p_qty, t.price_pence, fee * p_qty, (t.price_pence + fee) * p_qty, 'pending', acct, now() + interval '35 minutes')
    returning * into o;
  return query select o.id, o.access_token, t.price_pence, fee, acct;
end $$;
revoke all on function public.reserve_paid_tickets(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_paid_tickets(uuid, text, text, integer) to service_role;

-- Payment received: confirm the order and issue its tickets, once. Returns true only the first time.
-- If the hold had already expired, the tickets are taken again (capacity is raised rather than refuse a paid order).
create or replace function public.confirm_paid_order(p_order uuid, p_session text, p_intent text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o public.ticket_orders;
  c text;
begin
  select * into o from public.ticket_orders where id = p_order for update;
  if not found or o.status in ('confirmed', 'refunded', 'cancelled') then return false; end if;
  if o.status = 'expired' then
    update public.ticket_types set sold = sold + o.quantity, capacity = greatest(capacity, sold + o.quantity) where id = o.ticket_type_id;
  end if;
  update public.ticket_orders set status = 'confirmed', confirmed_at = now(), stripe_session_id = coalesce(p_session, stripe_session_id), stripe_payment_intent = p_intent where id = p_order;
  for i in 1..o.quantity loop
    loop
      c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      begin
        insert into public.tickets (order_id, event_id, ticket_type_id, code) values (o.id, o.event_id, o.ticket_type_id, c);
        exit;
      exception when unique_violation then
      end;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function public.confirm_paid_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_paid_order(uuid, text, text) to service_role;

-- Buyer left the payment page, or it timed out: give the held tickets back.
create or replace function public.release_ticket_order(p_order uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o public.ticket_orders;
begin
  select * into o from public.ticket_orders where id = p_order for update;
  if not found or o.status <> 'pending' then return false; end if;
  update public.ticket_orders set status = 'expired' where id = p_order;
  update public.ticket_types set sold = greatest(sold - o.quantity, 0) where id = o.ticket_type_id;
  return true;
end $$;
revoke all on function public.release_ticket_order(uuid) from public, anon, authenticated;
grant execute on function public.release_ticket_order(uuid) to service_role;

-- Refunded or cancelled: tickets stop working and go back on sale.
create or replace function public.void_ticket_order(p_order uuid, p_status text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o public.ticket_orders;
begin
  if p_status not in ('refunded', 'cancelled') then raise exception 'bad_status'; end if;
  select * into o from public.ticket_orders where id = p_order for update;
  if not found or o.status <> 'confirmed' then return false; end if;
  update public.ticket_orders set status = p_status, refunded_at = case when p_status = 'refunded' then now() else refunded_at end where id = p_order;
  update public.ticket_types set sold = greatest(sold - o.quantity, 0) where id = o.ticket_type_id;
  return true;
end $$;
revoke all on function public.void_ticket_order(uuid, text) from public, anon, authenticated;
grant execute on function public.void_ticket_order(uuid, text) to service_role;
