-- Stripe billing fields for advertiser applications.
-- The base table is created defensively so preview branches that have not replayed
-- the earlier advertiser migration can still apply this migration cleanly.
create table if not exists public.advertiser_applications (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  package text not null check (package in ('standard', 'featured')),
  business_name text not null,
  category text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website_url text,
  description text,
  logo_path text,
  asset_paths jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected', 'active')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'waived')),
  stripe_customer_id text,
  stripe_checkout_session_id text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.advertiser_applications
  add column if not exists billing text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_subscription_id text;

alter table public.advertiser_applications drop constraint if exists advertiser_applications_billing_check;
alter table public.advertiser_applications
  add constraint advertiser_applications_billing_check
  check (billing is null or billing in ('monthly', 'yearly'));

alter table public.advertiser_applications enable row level security;

create index if not exists advertiser_applications_payment_idx
  on public.advertiser_applications (payment_status, created_at desc);
