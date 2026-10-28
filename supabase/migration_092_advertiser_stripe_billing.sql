-- Stripe billing fields for advertiser applications.
alter table public.advertiser_applications
  add column if not exists billing text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_subscription_id text;

alter table public.advertiser_applications drop constraint if exists advertiser_applications_billing_check;
alter table public.advertiser_applications
  add constraint advertiser_applications_billing_check
  check (billing is null or billing in ('monthly', 'yearly'));

create index if not exists advertiser_applications_payment_idx
  on public.advertiser_applications (payment_status, created_at desc);
