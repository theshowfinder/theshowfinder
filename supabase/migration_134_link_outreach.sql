-- Migration 134: backlink outreach. Venues (we list their shows), organisers (free listings and tickets) and press
-- (data stories) get a short personal email offering something useful: a free "what's on" widget, free listings or
-- figures for a story. Every email waits for Chris's approval in /admin/backlinks before it is sent; one follow-up after
-- 7 days; a daily check spots when a site starts linking to us. Safe to re-run.

create table if not exists public.link_prospects (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('venue', 'organiser', 'press')),
  name               text not null,
  city               text,
  website            text,
  domain             text,
  email              text,
  contact_name       text,
  venue_id           uuid references public.venues(id) on delete set null,
  organiser_prospect_id uuid,
  shows              integer,
  page_url           text,
  pitch              text not null default 'widget',
  subject            text,
  body               text,
  company_number     text,
  status             text not null default 'found' check (status in ('found', 'no_site', 'no_email', 'ready', 'approved', 'sent', 'followed_up', 'replied', 'linked', 'declined', 'skipped', 'unsubscribed', 'failed')),
  notes              text,
  unsubscribe_token  text not null default replace(gen_random_uuid()::text, '-', ''),
  approved_at        timestamptz,
  sent_at            timestamptz,
  followed_up_at     timestamptz,
  replied_at         timestamptz,
  linked_at          timestamptz,
  link_url           text,
  checked_at         timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists link_prospects_venue_idx on public.link_prospects (venue_id) where venue_id is not null;
create unique index if not exists link_prospects_org_idx on public.link_prospects (organiser_prospect_id) where organiser_prospect_id is not null;
create index if not exists link_prospects_domain_idx on public.link_prospects (domain);
create index if not exists link_prospects_status_idx on public.link_prospects (status, created_at);
alter table public.link_prospects enable row level security;
revoke all on public.link_prospects from anon, authenticated;
grant select, insert, update, delete on public.link_prospects to service_role;

-- Venues worth contacting: 3+ upcoming live shows, not already in link_prospects. Busiest first.
create or replace view public.link_venue_targets with (security_invoker = true) as
  select v.id, v.name, v.slug, v.city, v.lat, v.lng, count(e.id)::int as shows
  from public.venues v
  join public.events e on e.venue_id = v.id and e.start_date > now() and e.status::text not in ('cancelled', 'postponed')
  where not exists (select 1 from public.link_prospects lp where lp.venue_id = v.id)
  group by v.id
  having count(e.id) >= 3;
revoke all on public.link_venue_targets from anon, authenticated;
grant select on public.link_venue_targets to service_role;
