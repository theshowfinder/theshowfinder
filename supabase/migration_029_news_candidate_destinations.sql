-- migration_029_news_candidate_destinations.sql
-- "News Intelligence Inbox" — explicit publishing destinations, separate
-- from geographic scope/targeting.
--
-- Before this migration, "where does a story appear publicly" was entirely
-- implied by scope_type: a 'national' candidate always hit the homepage's
-- NATIONAL_SLUG bucket in city_news (see src/lib/newsPublishing.ts /
-- resolveCityNewsTargets), a 'city' candidate hit its selected cities via
-- news_candidate_cities. There was no way to publish a city-scoped story
-- to the homepage too, no way to exclude a national story from the
-- homepage, and no concept of the public Main News page at all.
--
-- These two columns make Homepage and Main-News-page independent,
-- explicit destinations an admin opts into — same multi-select spirit as
-- the existing city checkboxes, just binary rather than many-to-many (a
-- story either is or isn't on the homepage; no join table needed for
-- that). Geographic scope/targeting (scope_type, city_slug/city_name,
-- news_candidate_cities) is completely unchanged by this migration.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- (This repo has no CLI-linked migration workflow — every migration file
-- here, including this one, is applied by pasting it into the SQL Editor.)

ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS publish_to_homepage boolean NOT NULL DEFAULT false;
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS publish_to_news_page boolean NOT NULL DEFAULT false;

-- Backfill, so existing candidates keep doing exactly what they do today:
-- every national candidate already (and only ever) publishes to the
-- homepage, so it keeps doing that after this ships. No backfill needed
-- for publish_to_news_page — nothing publishes to a Main News page today
-- (that page didn't read from city_news at all before this change), so
-- leaving every existing row at the false default is correct, not an
-- oversight. City-scoped candidates are untouched by either backfill —
-- they never touched the homepage before and still won't unless an admin
-- explicitly opts one in via Edit.
UPDATE public.news_candidates SET publish_to_homepage = true WHERE scope_type = 'national';

-- No change to city_news's schema: the Main News page destination reuses
-- the existing table with one more recognized sentinel city_slug value
-- ('news-hub', alongside the existing 'national' for the homepage — see
-- NEWS_HUB_SLUG in src/lib/cityNews.ts / src/lib/newsPublishing.ts).
-- city_news.city_slug has always been a plain, unconstrained text column
-- (migration_021_city_news.sql), so this needs no ALTER here.
