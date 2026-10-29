-- Migration 095: advertiser offers, QR vouchers and click counts.
--
-- local_businesses: the offer shown on the ad ("10% off with your show ticket"), a "Book a table" link, and a map
--   position (from the postcode) so show pages can say "4 min walk from the venue".
-- local_business_accounts.redeem_pin: the 4-digit staff PIN that marks a voucher as used (private, server only).
-- business_vouchers: one row per voucher a visitor claims. Unique one-off code, valid window, used or not.
--   client_key is a one-way hash of the visitor's connection for the one-per-day limit (no IP is stored).
-- business_clicks: clicks on an ad's website / booking links, for the advertiser's monthly report.
-- Both new tables are server only (RLS on, no public policies).

alter table public.local_businesses
  add column if not exists offer_text  text,
  add column if not exists booking_url text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.advertiser_applications
  add column if not exists offer_text  text,
  add column if not exists booking_url text,
  add column if not exists postcode    text;

alter table public.local_business_accounts
  add column if not exists redeem_pin text,
  add column if not exists last_report_at timestamptz;

create table if not exists public.business_vouchers (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  business_id  uuid not null references public.local_businesses(id) on delete cascade,
  event_id     uuid references public.events(id) on delete set null,
  source       text not null check (source in ('event', 'city')),
  offer_text   text not null,
  valid_from   timestamptz not null,
  expires_at   timestamptz not null,
  client_key   text not null,
  email        text,
  redeemed_at  timestamptz,
  pin_failures int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists business_vouchers_business_idx on public.business_vouchers (business_id, created_at);
create index if not exists business_vouchers_client_idx on public.business_vouchers (business_id, client_key, created_at);
alter table public.business_vouchers enable row level security;

create table if not exists public.business_clicks (
  id          bigserial primary key,
  business_id uuid not null references public.local_businesses(id) on delete cascade,
  kind        text not null check (kind in ('website', 'booking')),
  event_id    uuid references public.events(id) on delete set null,
  human       boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists business_clicks_business_idx on public.business_clicks (business_id, created_at);
alter table public.business_clicks enable row level security;

grant select, insert, update, delete on public.business_vouchers to service_role;
grant select, insert, update, delete on public.business_clicks to service_role;
grant usage, select on sequence public.business_clicks_id_seq to service_role;
