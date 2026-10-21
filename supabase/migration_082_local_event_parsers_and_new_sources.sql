-- Local events, 21 Oct 2026:
-- 1) local_event_sources.parser: how a source's event pages are read. 'jsonld' (schema.org Event markup, the original
--    reader) or one of the HTML readers in src/lib/localEventHtml.ts for sites with no event markup:
--    'newmind' (Visit Nottinghamshire / Plymouth / Stoke / Bradford / Brighton / Exeter / Bath platform), 'edinburgh',
--    'glasgow', 'leeds', 'cardiff', 'cambridge', 'sheffield', 'bournemouth'. Column only, no new table.
-- 2) New sources, each checked against the live site first (probe / reader check on real pages, 21 Oct 2026).
--    English Heritage was checked but left out: it lists the whole country with no coordinates, so events
--    could not be placed in the right city.
alter table public.local_event_sources
  add column if not exists parser text not null default 'jsonld';

insert into public.local_event_sources
  (key, city, label, event_source, base_url, discovery, discovery_url, detail_pattern, sitemap_child_pattern, page_param, page_size, max_pages, max_details_per_run, parser)
values
  ('nottingham_visit',  'Nottingham',     'Visit Nottinghamshire', 'nottingham_council',     'https://www.visit-nottinghamshire.co.uk', 'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('plymouth_visit',    'Plymouth',       'Visit Plymouth',        'plymouth_council',       'https://www.visitplymouth.co.uk',         'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('stoke_visit',       'Stoke-on-Trent', 'Visit Stoke',           'stoke_on_trent_council', 'https://www.visitstoke.co.uk',            'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('bradford_visit',    'Bradford',       'Visit Bradford',        'bradford_council',       'https://www.visitbradford.com',           'sitemap', '/sitemap.xml', '^/stayandexplore/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('brighton_visit',    'Brighton',       'Visit Brighton',        'brighton_council',       'https://www.visitbrighton.com',           'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('exeter_visit',      'Exeter',         'Visit Exeter',          'exeter_council',         'https://www.visitexeter.com',             'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('bath_visit',        'Bath',           'Visit Bath',            'bath_council',           'https://www.visitbath.co.uk',             'sitemap', '/sitemap.xml', '^/whats-on/[^/]+-p\d+$', null, null, null, 8, 300, 'newmind'),
  ('edinburgh_visit',   'Edinburgh',      'Forever Edinburgh',     'edinburgh_council',      'https://edinburgh.org',                   'sitemap', '/sitemap.xml', '^/(900/)?event/[^/]+/?$', null, null, null, 8, 300, 'edinburgh'),
  ('glasgow_visit',     'Glasgow',        'Visit Glasgow',         'glasgow_council',        'https://www.visitglasgow.com',            'sitemap', 'https://peoplemakeglasgow.com/sitemap.xml', '^/events/[^/]+-\d{8}-\d+/?$', null, null, null, 8, 300, 'glasgow'),
  ('leeds_visit',       'Leeds',          'Visit Leeds',           'leeds_council',          'https://www.visitleeds.co.uk',            'sitemap', '/sitemap.xml', '^/whats-on/[^/]+/[^/]+/?$', 'events-sitemap', null, null, 8, 300, 'leeds'),
  ('cardiff_visit',     'Cardiff',        'Visit Cardiff',         'cardiff_council',        'https://www.visitcardiff.com',            'sitemap', '/sitemap_index.xml', '^/events/[^/]+/?$', 'event-sitemap', null, null, 8, 300, 'cardiff'),
  ('cambridge_visit',   'Cambridge',      'Visit Cambridge',       'cambridge_council',      'https://www.visitcambridge.org',          'sitemap', '/sitemap.xml', '^/event/[^/]+/?$', 'event-sitemap', null, null, 8, 300, 'cambridge'),
  ('sheffield_visit',   'Sheffield',      'Welcome to Sheffield',  'sheffield_council',      'https://www.welcometosheffield.co.uk',    'sitemap', '/sitemap.xml', '^/content/events/[^/]+/?$', null, null, null, 8, 300, 'sheffield'),
  ('bournemouth_visit', 'Bournemouth',    'Visit Bournemouth',     'bournemouth_council',    'https://www.bournemouth.co.uk',           'sitemap', '/sitemap.xml', '^/event/[^/]+$', null, null, null, 8, 300, 'bournemouth'),
  ('london_british_library', 'London', 'British Library',            'london_council', 'https://events.bl.uk',                  'sitemap', '/sitemap.xml', '^/events/[^/]+/?$', null, null, null, 8, 300, 'jsonld'),
  ('london_vam',             'London', 'V&A',                        'london_council', 'https://www.vam.ac.uk',                 'listing', '/whatson', '^/event/[A-Za-z0-9]+/[^/]+$', null, null, null, 1, 300, 'jsonld'),
  ('london_conway_hall',     'London', 'Conway Hall',                'london_council', 'https://www.conwayhall.org.uk',         'sitemap', '/sitemaps.xml', '^/whats-on/event/[^/]+/$', 'events-sitemap', null, null, 8, 300, 'jsonld'),
  ('london_serpentine',      'London', 'Serpentine',                 'london_council', 'https://www.serpentinegalleries.org',   'sitemap', '/sitemap_index.xml', '^/whats-on/[^/]+/$', 'event-sitemap', null, null, 8, 300, 'jsonld'),
  ('london_wwt',             'London', 'WWT London Wetland Centre',  'london_council', 'https://www.wwt.org.uk',                'sitemap', '/sitemap.xml', '^/wetland-centres/london/whats-on/events/[^/]+$', 'sitemap-events-london', null, null, 8, 300, 'jsonld'),
  ('london_roundhouse',      'London', 'Roundhouse',                 'london_council', 'https://www.roundhouse.org.uk',         'sitemap', '/sitemap_index.xml', '^/whats-on/[^/]+/$', 'event-sitemap', null, null, 8, 300, 'jsonld'),
  ('london_kiln',            'London', 'Kiln Theatre',               'london_council', 'https://kilntheatre.com',               'listing', '/whats-on/', '^/whats-on/[^/]+/$', null, null, null, 1, 300, 'jsonld'),
  ('london_chickenshed',     'London', 'Chickenshed',                'london_council', 'https://www.chickenshed.org.uk',        'listing', '/calendar', '^/events/[^/]+$', null, null, null, 1, 300, 'jsonld'),
  ('newcastle_ne_museums',   'Newcastle',   'North East Museums',     'newcastle_council',   'https://www.northeastmuseums.org.uk', 'listing', '/whats-on', '^/[a-z]+/whats-on/[^/]+$', null, null, null, 1, 300, 'jsonld'),
  ('sunderland_wwt',         'Sunderland',  'WWT Washington',         'sunderland_council',  'https://www.wwt.org.uk',              'sitemap', '/sitemap.xml', '^/wetland-centres/washington/whats-on/events/[^/]+$', 'sitemap-events-washington', null, null, 8, 300, 'jsonld'),
  ('scarborough_sjt',        'Scarborough', 'Stephen Joseph Theatre', 'scarborough_council', 'https://sjt.uk.com',                  'sitemap', '/sitemap.xml', '^/events/[^/]+$', null, null, null, 8, 300, 'jsonld'),
  ('scarborough_yorkshire',  'Scarborough', 'Yorkshire.com Scarborough', 'scarborough_council', 'https://www.yorkshire.com',        'sitemap', '/sitemaps/sitemap-index.xml', '^/scarborough/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('leeds_yorkshire',        'Leeds',       'Yorkshire.com Leeds',    'leeds_council',       'https://www.yorkshire.com',           'sitemap', '/sitemaps/sitemap-index.xml', '^/leeds/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('sheffield_yorkshire',    'Sheffield',   'Yorkshire.com Sheffield', 'sheffield_council',  'https://www.yorkshire.com',           'sitemap', '/sitemaps/sitemap-index.xml', '^/sheffield/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('bradford_yorkshire',     'Bradford',    'Yorkshire.com Bradford', 'bradford_council',    'https://www.yorkshire.com',           'sitemap', '/sitemaps/sitemap-index.xml', '^/bradford/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('york_yorkshire',         'York',        'Yorkshire.com York',     'york_council',        'https://www.yorkshire.com',           'sitemap', '/sitemaps/sitemap-index.xml', '^/york/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('hull_yorkshire',         'Hull',        'Yorkshire.com Hull',     'hull_council',        'https://www.yorkshire.com',           'sitemap', '/sitemaps/sitemap-index.xml', '^/hull/events/[a-z-]+/[^/]+$', 'sitemap-events', null, null, 8, 300, 'jsonld'),
  ('ipswich_visit_suffolk',  'Ipswich',     'Visit Suffolk',          'ipswich_council',     'https://visitsuffolk.com',            'sitemap', '/sitemaps-1-sitemap.xml', '^/events/[^/]+$', 'section-events', null, null, 8, 300, 'jsonld'),
  ('coventry_warwick_arts',  'Coventry',    'Warwick Arts Centre',    'coventry_council',    'https://www.warwickartscentre.co.uk', 'sitemap', '/sitemap.xml', '^/whats-on/[A-Za-z0-9]{3}-[^/]+/$', null, null, null, 8, 300, 'jsonld'),
  ('coventry_shakespeare',   'Coventry',    'Shakespeare''s England', 'coventry_council',    'https://www.shakespeares-england.co.uk', 'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/$', null, null, null, 8, 300, 'jsonld')
on conflict (key) do nothing;
