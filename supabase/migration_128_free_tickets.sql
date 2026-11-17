-- Migration 128: free tickets through TheShowFinder (RSVP). Organisers list an event with N free tickets; people
-- claim them on the event page, get QR tickets by email, and the organiser scans them at the door. Safe to re-run.
-- Paid tickets (Stripe Connect) build on the same tables: price_pence, total_pence and fee_pence are ready for it.

-- A listing can now use our free tickets instead of a ticket link.
alter table public.event_submissions alter column ticket_url drop not null;
alter table public.event_submissions add column if not exists free_capacity integer;
alter table public.event_submissions drop constraint if exists event_submissions_free_capacity_check;
alter table public.event_submissions add constraint event_submissions_free_capacity_check check (free_capacity is null or free_capacity between 1 and 5000);

create table if not exists public.ticket_types (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  name           text not null default 'Free ticket',
  price_pence    integer not null default 0 check (price_pence >= 0),
  capacity       integer not null check (capacity > 0),
  sold           integer not null default 0 check (sold >= 0),
  max_per_order  integer not null default 6 check (max_per_order between 1 and 20),
  sales_start    timestamptz,
  sales_end      timestamptz,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint ticket_types_not_oversold check (sold <= capacity)
);
create index if not exists ticket_types_event_idx on public.ticket_types (event_id);
alter table public.ticket_types enable row level security;
-- The event page shows what is left, straight from the browser-safe columns.
drop policy if exists "Public read ticket types" on public.ticket_types;
create policy "Public read ticket types" on public.ticket_types for select to anon, authenticated using (true);
revoke all on public.ticket_types from anon, authenticated;
grant select (id, event_id, name, price_pence, capacity, sold, max_per_order, sales_start, sales_end, sort) on public.ticket_types to anon, authenticated;
grant select, insert, update, delete on public.ticket_types to service_role;

-- Orders and tickets hold names and emails: server only, never readable from the browser.
create table if not exists public.ticket_orders (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  ticket_type_id  uuid not null references public.ticket_types(id) on delete cascade,
  buyer_name      text not null,
  buyer_email     text not null,
  quantity        integer not null check (quantity between 1 and 20),
  total_pence     integer not null default 0,
  fee_pence       integer not null default 0,
  status          text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'refunded')),
  access_token    text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at      timestamptz not null default now()
);
create index if not exists ticket_orders_event_idx on public.ticket_orders (event_id);
create index if not exists ticket_orders_email_idx on public.ticket_orders (event_id, buyer_email);
alter table public.ticket_orders enable row level security;
revoke all on public.ticket_orders from anon, authenticated;
grant select, insert, update, delete on public.ticket_orders to service_role;

create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.ticket_orders(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  ticket_type_id  uuid not null references public.ticket_types(id) on delete cascade,
  code            text not null unique,
  checked_in_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists tickets_event_idx on public.tickets (event_id);
create index if not exists tickets_order_idx on public.tickets (order_id);
alter table public.tickets enable row level security;
revoke all on public.tickets from anon, authenticated;
grant select, insert, update, delete on public.tickets to service_role;

-- Claim free tickets in one step: locks the ticket type row, so two people can never get the last ticket.
create or replace function public.claim_free_tickets(p_type uuid, p_name text, p_email text, p_qty integer)
returns table (order_id uuid, access_token text)
language plpgsql security definer set search_path = public as $$
declare
  t public.ticket_types;
  o public.ticket_orders;
  had integer;
  c text;
begin
  if p_qty is null or p_qty < 1 then raise exception 'bad_quantity'; end if;
  select * into t from public.ticket_types where id = p_type for update;
  if not found then raise exception 'not_found'; end if;
  if t.price_pence <> 0 then raise exception 'not_free'; end if;
  if p_qty > t.max_per_order then raise exception 'too_many'; end if;
  if (t.sales_start is not null and now() < t.sales_start) or (t.sales_end is not null and now() > t.sales_end) then raise exception 'not_on_sale'; end if;
  if exists (select 1 from public.events e where e.id = t.event_id and (e.start_date < now() - interval '2 hours' or e.status in ('cancelled', 'postponed'))) then raise exception 'not_on_sale'; end if;
  select coalesce(sum(quantity), 0) into had from public.ticket_orders
    where event_id = t.event_id and buyer_email = lower(p_email) and status = 'confirmed';
  if had + p_qty > t.max_per_order then raise exception 'already_have'; end if;
  if t.sold + p_qty > t.capacity then raise exception 'sold_out'; end if;

  update public.ticket_types set sold = sold + p_qty where id = p_type;
  insert into public.ticket_orders (event_id, ticket_type_id, buyer_name, buyer_email, quantity)
    values (t.event_id, p_type, p_name, lower(p_email), p_qty) returning * into o;
  for i in 1..p_qty loop
    loop
      c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      begin
        insert into public.tickets (order_id, event_id, ticket_type_id, code) values (o.id, t.event_id, p_type, c);
        exit;
      exception when unique_violation then
        -- vanishingly rare clash: pick another code
      end;
    end loop;
  end loop;
  return query select o.id, o.access_token;
end $$;
revoke all on function public.claim_free_tickets(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_free_tickets(uuid, text, text, integer) to service_role;
