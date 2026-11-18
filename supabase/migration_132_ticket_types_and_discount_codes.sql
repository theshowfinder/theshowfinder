-- Migration 132: several ticket types per event (Standard, VIP, Early bird with an end date) and discount codes.
-- Organisers set both up when they list (event_submissions.ticket_plan); publishing creates the ticket_types and
-- discount_codes rows. A code takes a % or £ off the ticket price; the booking fee is worked out on the price paid,
-- and a ticket never goes below £1. Uses are counted in tickets (confirmed, plus holds still on the payment page).
-- Safe to re-run.

alter table public.event_submissions add column if not exists ticket_plan jsonb;

create table if not exists public.discount_codes (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  code              text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  percent_off       integer check (percent_off between 1 and 90),
  amount_off_pence  integer check (amount_off_pence between 10 and 100000),
  max_uses          integer check (max_uses between 1 and 10000),
  expires_at        timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint discount_codes_one_kind check ((percent_off is null) <> (amount_off_pence is null))
);
create unique index if not exists discount_codes_event_code_idx on public.discount_codes (event_id, code);
alter table public.discount_codes enable row level security;
-- Codes are secret: server only.
revoke all on public.discount_codes from anon, authenticated;
grant select, insert, update, delete on public.discount_codes to service_role;

alter table public.ticket_orders add column if not exists discount_code_id uuid references public.discount_codes(id) on delete set null;
alter table public.ticket_orders add column if not exists discount_pence integer not null default 0;
create index if not exists ticket_orders_discount_idx on public.ticket_orders (discount_code_id) where discount_code_id is not null;

-- Same as migration 130, plus an optional discount code. The old 4-argument version is dropped so calls are not ambiguous.
drop function if exists public.reserve_paid_tickets(uuid, text, text, integer);
create or replace function public.reserve_paid_tickets(p_type uuid, p_name text, p_email text, p_qty integer, p_code text default null)
returns table (order_id uuid, access_token text, unit_price integer, unit_fee integer, stripe_account text, unit_discount integer)
language plpgsql security definer set search_path = public as $$
declare
  t public.ticket_types;
  o public.ticket_orders;
  d public.discount_codes;
  acct text;
  released integer;
  had integer;
  used integer;
  price integer;
  off integer := 0;
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

  price := t.price_pence;
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into d from public.discount_codes where event_id = t.event_id and code = upper(trim(p_code)) for update;
    if not found or not d.active or (d.expires_at is not null and now() > d.expires_at) then raise exception 'bad_code'; end if;
    if d.max_uses is not null then
      select coalesce(sum(quantity), 0) into used from public.ticket_orders
        where discount_code_id = d.id and (status = 'confirmed' or (status = 'pending' and expires_at > now()));
      if used + p_qty > d.max_uses then raise exception 'code_used_up'; end if;
    end if;
    off := coalesce(round(t.price_pence * d.percent_off / 100.0), d.amount_off_pence);
    price := greatest(t.price_pence - off, 100);
    off := t.price_pence - price;
  end if;

  with gone as (
    update public.ticket_orders set status = 'expired'
    where ticket_type_id = p_type and status = 'pending' and expires_at < now() returning quantity
  ) select coalesce(sum(quantity), 0) into released from gone;
  if released > 0 then t.sold := greatest(t.sold - released, 0); end if;

  select coalesce(sum(quantity), 0) into had from public.ticket_orders
    where event_id = t.event_id and buyer_email = lower(p_email) and status in ('confirmed', 'pending');
  if had + p_qty > t.max_per_order then raise exception 'already_have'; end if;
  if t.sold + p_qty > t.capacity then raise exception 'sold_out'; end if;

  fee := round(price * 0.06) + 49;
  update public.ticket_types set sold = t.sold + p_qty where id = p_type;
  insert into public.ticket_orders (event_id, ticket_type_id, buyer_name, buyer_email, quantity, ticket_price_pence, fee_pence, total_pence, status, stripe_account_id, expires_at, discount_code_id, discount_pence)
    values (t.event_id, p_type, p_name, lower(p_email), p_qty, price, fee * p_qty, (price + fee) * p_qty, 'pending', acct, now() + interval '35 minutes', d.id, off * p_qty)
    returning * into o;
  return query select o.id, o.access_token, price, fee, acct, off;
end $$;
revoke all on function public.reserve_paid_tickets(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_paid_tickets(uuid, text, text, integer, text) to service_role;
