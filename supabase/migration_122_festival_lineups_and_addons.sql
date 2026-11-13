-- Migration 122: festival line-ups + hide festival add-on tickets. Safe to re-run.

-- 1. Add-on tickets (parking, campervans, glamping, hotel packages, souvenir
--    tickets, transport, upgrades) and sellers' test listings stop appearing as
--    shows. Same rule as src/lib/listingAddons.ts: change both together.
create or replace function public.is_listing_addon(t text) returns boolean
language sql immutable as $$
  select coalesce(t ~* 'do not purchase', false)
      or (coalesce(t ~* '(20[0-9]{2}|festival|fest\M|weekender|fayre)', false)
          and coalesce(t ~* '\m(parking|car park|motorbike park|park pass|campervan|caravan|motorhome|trailer park|rv|yurts?|tipi|bell tent|bell for|bell house|bedouin|cabins?|glamping|pods?|lodge|airstream|safari|wagon|hut|tent for|tenthouse|hotel at|souvenir|lockers?|shuttle|transport|upgrade|rip)\M', false)
          and not coalesce(t ~* '\m(show|exhibition)\M', false))
$$;

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
    AND NOT public.is_listing_addon(ewv.title);
grant select on public.listed_events_with_venue to anon, authenticated, service_role;   -- unchanged access; the public site reads this view

-- 2. Line-up links: which act-to-festival links came from a festival's line-up
--    page, and when we first saw them (existing rows stay null on purpose, so
--    nothing old is announced as new).
alter table public.event_artists add column if not exists source text;
alter table public.event_artists add column if not exists created_at timestamptz;
alter table public.event_artists alter column created_at set default now();
create index if not exists event_artists_lineup_idx on public.event_artists (created_at) where source = 'lineup';

-- 3. Festivals whose official line-up page we read daily. title_pattern is an
--    ILIKE pattern for the festival's Ticketmaster listings.
create table if not exists public.festival_lineup_sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  title_pattern   text not null,
  lineup_url      text not null unique,
  active          boolean not null default true,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_hash       text,
  last_found      integer,
  last_linked     integer,
  last_error      text,
  created_at      timestamptz not null default now()
);
alter table public.festival_lineup_sources enable row level security;
grant select, insert, update, delete on public.festival_lineup_sources to service_role;   -- Supabase Data API: new tables need explicit grants (30 Oct 2026)

insert into public.festival_lineup_sources (name, title_pattern, lineup_url) values
  ('Download Festival 2027', 'Download 2027%', 'https://downloadfestival.co.uk/artists-a-z/'),
  ('Isle of Wight Festival 2027', 'Isle of Wight Festival 2027%', 'https://isleofwightfestival.com/line-up/')
on conflict (lineup_url) do nothing;
