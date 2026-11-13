-- Migration 124: the daily listings check. Safe to re-run.

-- 1. Things that are never tickets, whatever the event (merch bundles, gift cards,
--    "upgrade only, no ticket included"...). Same rule as src/lib/listingAddons.ts.
create or replace function public.is_listing_addon(t text) returns boolean
language sql immutable as $$
  select coalesce(t ~* '(do not purchase|tickets? not included|no ticket included|(does not|doesn''?t) include (the )?(event )?ticket|upgrades? only|gift card|merch(andise)? bundle|t-?shirt)', false)
      or (coalesce(t ~* '(20[0-9]{2}|festival|fest\M|weekender|fayre)', false)
          and coalesce(t ~* '\m(parking|car park|motorbike park|park pass|campervan|caravan|motorhome|trailer park|rv|yurts?|tipi|bell tent|bell for|bell house|bedouin|cabins?|glamping|pods?|lodge|airstream|safari|wagon|hut|tent for|tenthouse|hotel at|souvenir|lockers?|shuttle|transport|upgrade|rip)\M', false)
          and not coalesce(t ~* '\m(show|exhibition)\M', false))
$$;

-- 2. Listings hidden from the site: exact duplicates (by the daily check) and
--    anything hidden from /admin/listing-check. The public site reads this to
--    leave them out, so it is readable but only the server can write it.
create table if not exists public.listing_hides (
  event_id   uuid primary key references public.events(id) on delete cascade,
  reason     text not null,
  hidden_by  text not null default 'listing-check',
  hidden_at  timestamptz not null default now()
);
alter table public.listing_hides enable row level security;
drop policy if exists "Public read listing_hides" on public.listing_hides;
create policy "Public read listing_hides" on public.listing_hides for select to anon, authenticated using (true);
grant select on public.listing_hides to anon, authenticated;
grant select, insert, update, delete on public.listing_hides to service_role;

-- 3. Listings the check is not sure about, for a person to look at once.
create table if not exists public.listing_quality_issues (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  other_event_id uuid references public.events(id) on delete cascade,
  kind           text not null,
  detail         text not null,
  status         text not null default 'open' check (status in ('open', 'ok', 'hidden')),
  first_seen_at  timestamptz not null default now(),
  reviewed_at    timestamptz,
  unique (event_id, kind)
);
create index if not exists listing_quality_issues_open_idx on public.listing_quality_issues (first_seen_at) where status = 'open';
alter table public.listing_quality_issues enable row level security;
grant select, insert, update, delete on public.listing_quality_issues to service_role;

-- 4. The public listing view leaves hidden listings out.
create or replace view public.listed_events_with_venue as
 SELECT ewv.id, ewv.title, ewv.slug, ewv.description, ewv.category, ewv.start_date, ewv.end_date, ewv.image_url,
    ewv.price_from, ewv.price_to, ewv.currency, ewv.tickets_url, ewv.status, ewv.is_featured, ewv.onsale_date,
    ewv.public_onsale_start, ewv.public_onsale_end, ewv.presale_start, ewv.presale_end, ewv.presale_name,
    ewv.on_sale_this_week, ewv.presale_this_week, ewv.upcoming_presale, ewv.newly_announced, ewv.last_synced_at,
    ewv.venue_id, ewv.venue_name, ewv.venue_city, ewv.venue_postcode, ewv.venue_capacity, ewv.venue_slug,
    ewv.resale_from, ewv.gigsberg_inventory_status
   FROM events_with_venue ewv
     LEFT JOIN event_canonical_map m ON m.id = ewv.id
  WHERE (m.id IS NULL OR m.is_canonical)
    AND NOT public.is_listing_addon(ewv.title)
    AND NOT EXISTS (SELECT 1 FROM public.listing_hides h WHERE h.event_id = ewv.id);
grant select on public.listed_events_with_venue to anon, authenticated, service_role;
