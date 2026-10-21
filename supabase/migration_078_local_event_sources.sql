-- Local events sweep for every city: a registry of council / venue / tourist-board "what's on" sources
-- plus a ledger of every event page the sweep has looked at (so a big sitemap is worked through once,
-- then only new and due pages are fetched). Admin / service role only.
--
-- discovery = 'listing'  : a paginated "what's on" page whose links match detail_pattern (Derby council sites)
-- discovery = 'sitemap'  : an XML sitemap (or sitemap index; sitemap_child_pattern picks the event child maps)
-- detail_pattern         : regex tested against the URL path of each candidate event page
-- event_source           : value written to events.source for rows from this source (must end in _council so the
--                          existing dead-event check and counts pick them up), e.g. 'derby_council'

create table if not exists public.local_event_sources (
  id                    uuid primary key default gen_random_uuid(),
  key                   text not null unique,
  city                  text not null,
  label                 text not null,
  event_source          text not null check (event_source like '%\_council'),
  base_url              text not null,
  discovery             text not null check (discovery in ('listing', 'sitemap')),
  discovery_url         text not null,
  detail_pattern        text not null,
  sitemap_child_pattern text,
  page_param            text,
  page_size             integer,
  max_pages             integer not null default 8,
  max_details_per_run   integer not null default 300,
  enabled               boolean not null default true,
  last_run_at           timestamptz,
  last_stats            jsonb,
  created_at            timestamptz not null default now()
);
create index if not exists local_event_sources_city_idx on public.local_event_sources (lower(city));
alter table public.local_event_sources enable row level security;
revoke all on public.local_event_sources from anon, authenticated;

create table if not exists public.local_event_urls (
  url         text primary key,
  source_key  text not null,
  state       text not null check (state in ('event', 'past', 'noevent', 'gone')),
  start_date  timestamptz,
  checked_at  timestamptz not null default now()
);
create index if not exists local_event_urls_source_idx on public.local_event_urls (source_key, state);
alter table public.local_event_urls enable row level security;
revoke all on public.local_event_urls from anon, authenticated;

insert into public.local_event_sources
  (key, city, label, event_source, base_url, discovery, discovery_url, detail_pattern, sitemap_child_pattern, page_param, page_size, max_pages, max_details_per_run)
values
  ('derby_market_hall', 'Derby', 'Derby Market Hall', 'derby_council', 'https://www.derbymarkethall.co.uk', 'listing', '/whats-on/', '^/whats-on/[a-z0-9][a-z0-9-]*/$', null, 'ccm_paging_p', 12, 8, 120),
  ('derby_live',        'Derby', 'Derby LIVE',        'derby_council', 'https://www.derbylive.co.uk',       'listing', '/whats-on/', '^/whats-on/[a-z0-9][a-z0-9-]*/$', null, 'ccm_paging_p', 12, 8, 120),
  ('birmingham_visit',  'Birmingham', 'Visit Birmingham',   'birmingham_council',  'https://visitbirmingham.com',     'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('manchester_visit',  'Manchester', 'Visit Manchester',   'manchester_council',  'https://www.visitmanchester.com', 'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('bristol_visit',     'Bristol',    'Visit Bristol',      'bristol_council',     'https://visitbristol.co.uk',      'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('belfast_visit',     'Belfast',    'Visit Belfast',      'belfast_council',     'https://visitbelfast.com',        'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('southampton_visit', 'Southampton','Visit Southampton',  'southampton_council', 'https://www.visitsouthampton.co.uk','sitemap','/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('portsmouth_visit',  'Portsmouth', 'Visit Portsmouth',   'portsmouth_council',  'https://www.visitportsmouth.co.uk','sitemap','/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('swansea_visit',     'Swansea',    'Visit Swansea Bay',  'swansea_council',     'https://www.visitswanseabay.com', 'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('hull_visit',        'Hull',       'Visit Hull',         'hull_council',        'https://www.visithull.com',       'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300),
  ('leicester_visit',   'Leicester',  'Visit Leicester',    'leicester_council',    'https://visitleicester.info',     'sitemap', '/sitemap.xml', '^/event/[^/]+/?$', 'posts-event', null, null, 8, 300),
  ('norwich_visit',     'Norwich',    'Visit Norwich',      'norwich_council',     'https://www.visitnorwich.co.uk',  'sitemap', '/sitemap_index.xml', '^/event/[^/]+/?$', 'event-sitemap', null, null, 8, 300),
  ('oxford_visit',      'Oxford',     'Experience Oxfordshire', 'oxford_council',  'https://www.experienceoxfordshire.org', 'sitemap', '/sitemap_index.xml', '^/event/[^/]+/?$', 'tribe_events-sitemap', null, null, 8, 300),
  ('york_visit',        'York',       'Visit York',         'york_council',        'https://visityork.org',           'sitemap', '/sitemaps-1-sitemap.xml', '^/events/(?!category)[^/]+$', 'section-events-', null, null, 8, 300),
  ('aberdeen_visit',    'Aberdeen',   'Visit Aberdeen',     'aberdeen_council',    'https://visitabdn.com',           'sitemap', '/sitemaps-1-sitemap.xml', '^/events/\d+-[^/]+$', 'section-events-', null, null, 8, 300)
on conflict (key) do nothing;

-- "Remove automatically": dropped / cancelled council events are now cancelled for real (still capped per run, with the
-- circuit breaker for a site that changed shape). Reversible: if a site lists the event again the next sweep restores it.
update public.council_sync_state set mode = 'live', max_removals_per_run = 50 where id = 1;
