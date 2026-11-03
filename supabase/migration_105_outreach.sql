-- Advertiser outreach (3 Nov 2026): businesses near busy venues, emailed a short pitch from partners@ only after
-- Chris approves each one. Every email carries an unsubscribe link; unsubscribed businesses are never emailed again.
-- UK PECR: cold email to limited companies / LLPs with an opt-out is fine; sole traders and partnerships need consent,
-- so the sender only sends to company_type 'ltd' (or 'consented').
create table if not exists public.outreach_prospects (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  category          text not null default 'Restaurant',     -- Restaurant | Bar | Pub | Cafe | Hotel | Other
  city              text not null,
  near_venue        text,                                    -- "Co-op Live"
  distance_label    text,                                    -- "a 5-minute walk from Co-op Live"
  email             text not null,
  website           text,
  address           text,
  company_type      text not null default 'unknown',         -- ltd | sole_trader | partnership | unknown | consented
  company_number    text,                                    -- Companies House
  status            text not null default 'to_check',        -- to_check | approved | sent | followed_up | replied | not_interested | signed_up | unsubscribed | bounced
  ref_code          text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  unsubscribe_token text not null unique default md5(gen_random_uuid()::text),
  notes             text,
  sent_at           timestamptz,
  followed_up_at    timestamptz,
  clicked_at        timestamptz,
  replied_at        timestamptz,
  unsubscribed_at   timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists outreach_prospects_email_idx on public.outreach_prospects (lower(email));
create index if not exists outreach_prospects_status_idx on public.outreach_prospects (status);

alter table public.outreach_prospects enable row level security;
grant select, insert, update, delete on public.outreach_prospects to service_role;
