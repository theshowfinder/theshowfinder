-- Migration 126: "List your event" for local organisers (promoters, venues, bands). Safe to re-run.
-- Free listings (checked before they go live), paid Boost (£9.95 per event) and Promoter plan (£19.95 a month).

create table if not exists public.organisers (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null unique,
  name                   text not null,
  slug                   text not null unique,
  website                text,
  bio                    text,
  logo_url               text,
  instagram              text,
  facebook               text,
  plan                   text not null default 'free' check (plan in ('free', 'promoter')),
  plan_status            text,                      -- active / cancelled / past_due (Stripe)
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.organisers enable row level security;
-- Public promoter pages read name, slug, bio, logo and links; email and Stripe ids are only read by the server.
drop policy if exists "Public read promoter organisers" on public.organisers;
create policy "Public read promoter organisers" on public.organisers for select to anon, authenticated using (plan = 'promoter' and plan_status = 'active');
-- Email and Stripe ids must never be readable from the browser: no table-wide access, only these columns.
revoke all on public.organisers from anon, authenticated;
grant select (id, name, slug, website, bio, logo_url, instagram, facebook, plan, plan_status) on public.organisers to anon, authenticated;
grant select, insert, update, delete on public.organisers to service_role;

create table if not exists public.event_submissions (
  id                 uuid primary key default gen_random_uuid(),
  organiser_id       uuid not null references public.organisers(id) on delete cascade,
  title              text not null,
  category           text not null,
  start_date         timestamptz not null,
  venue_name         text not null,
  city               text not null,
  postcode           text,
  ticket_url         text not null,
  price_from         numeric,
  description        text,
  image_url          text,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_reason      text,                           -- why it needed a look, or why it was rejected
  event_id           uuid references public.events(id) on delete set null,
  boost              text check (boost in ('boost', 'promoter')),
  boost_paid_at      timestamptz,
  stripe_session_id  text,
  manage_token       text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz
);
create index if not exists event_submissions_pending_idx on public.event_submissions (created_at) where status = 'pending';
create index if not exists event_submissions_organiser_idx on public.event_submissions (organiser_id);
alter table public.event_submissions enable row level security;
revoke all on public.event_submissions from anon, authenticated;
grant select, insert, update, delete on public.event_submissions to service_role;

-- Which listings came from an organiser, and until when a paid boost keeps them featured.
alter table public.events add column if not exists organiser_id uuid references public.organisers(id) on delete set null;
alter table public.events add column if not exists boost_until timestamptz;
create index if not exists events_organiser_idx on public.events (organiser_id) where organiser_id is not null;

-- Event photos organisers upload (public, like business logos).
insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true) on conflict (id) do nothing;
