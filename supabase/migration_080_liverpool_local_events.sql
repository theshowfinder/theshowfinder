-- Local events sweep: add Visit Liverpool (same schema.org Event markup and /event/<slug>/<id>/
-- sitemap layout as Visit Birmingham / Manchester, checked 21 Oct 2026). Row only, no new table.
insert into public.local_event_sources
  (key, city, label, event_source, base_url, discovery, discovery_url, detail_pattern, sitemap_child_pattern, page_param, page_size, max_pages, max_details_per_run)
values
  ('liverpool_visit', 'Liverpool', 'Visit Liverpool', 'liverpool_council', 'https://www.visitliverpool.com', 'sitemap', '/sitemap.xml', '^/event/[^/]+/\d+/?$', null, null, null, 8, 300)
on conflict (key) do nothing;
