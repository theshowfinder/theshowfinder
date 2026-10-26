-- Migration 091: paid local business placements (city guide + "Before the show" on event pages).
--
-- local_businesses (public): what visitors see. Only ACTIVE listings that have not expired are
-- readable with the anon key, so a business that signs up (pending) or stops paying (cancelled)
-- never shows on the site.
--   package  'standard' = a place in the city's local guide
--            'featured' = top of the city guide + the "Before the show" box on show pages in that city
--   status   pending (signed up, not live yet) | active | paused | cancelled
--   active_until  optional end date (yearly payments, trials); null = open-ended
--
-- local_business_accounts (private, server only): contact and billing details, never public.

alter table public.local_businesses
  add column if not exists package      text not null default 'standard',
  add column if not exists status       text not null default 'active',
  add column if not exists logo_url     text,
  add column if not exists address      text,
  add column if not exists postcode     text,
  add column if not exists active_until timestamptz,
  add column if not exists updated_at   timestamptz not null default now();

alter table public.local_businesses drop constraint if exists local_businesses_package_check;
alter table public.local_businesses add constraint local_businesses_package_check check (package in ('standard', 'featured'));
alter table public.local_businesses drop constraint if exists local_businesses_status_check;
alter table public.local_businesses add constraint local_businesses_status_check check (status in ('pending', 'active', 'paused', 'cancelled'));
alter table public.local_businesses drop constraint if exists local_businesses_category_check;
alter table public.local_businesses add constraint local_businesses_category_check
  check (category in ('restaurant', 'bar', 'cafe', 'hotel', 'transport', 'parking', 'beauty', 'shop', 'attraction', 'other'));

-- Existing sponsored listings become featured.
update public.local_businesses set package = 'featured' where is_sponsored and package = 'standard';

create index if not exists local_businesses_city_live_idx on public.local_businesses (lower(city), package) where status = 'active';

drop policy if exists "Local businesses are publicly readable" on public.local_businesses;
create policy "Live local businesses are publicly readable"
  on public.local_businesses for select
  using (status = 'active' and (active_until is null or active_until > now()));

create table if not exists public.local_business_accounts (
  business_id            uuid primary key references public.local_businesses(id) on delete cascade,
  contact_name           text,
  contact_email          text not null,
  phone                  text,
  billing                text check (billing in ('monthly', 'yearly')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  notes                  text,
  created_at             timestamptz not null default now()
);
alter table public.local_business_accounts enable row level security;

grant select, insert, update, delete on public.local_businesses to service_role;
grant select on public.local_businesses to anon, authenticated;
grant select, insert, update, delete on public.local_business_accounts to service_role;
