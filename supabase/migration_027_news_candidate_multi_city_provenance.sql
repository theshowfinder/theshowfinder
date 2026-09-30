-- migration_027_news_candidate_multi_city_provenance.sql
-- "News Intelligence Inbox" Phase 2 additions:
--   1. source_url — the publisher's own site/section link, distinct from
--      `url` (the specific article link). Optional; lets the admin UI and
--      (later, if wanted) the public card show "via <source>" pointing at
--      the outlet itself, separately from "read the article" pointing at
--      the specific story.
--   2. created_by / reviewed_by — who added/reviewed a candidate. NOTE:
--      this admin currently has a single shared password
--      (process.env.ADMIN_PASSWORD, see src/lib/admin-auth.ts) with no
--      per-person login, so there is no real user identity to store yet —
--      these columns are populated with the literal string 'admin' for
--      now. Wiring them up now means real attribution becomes free the
--      day this site gets per-admin accounts, without another migration.
--   3. news_candidate_cities — a candidate can now target more than one
--      city (Phase 1 only supported exactly one). This is a normal
--      candidate-to-city join table; news_candidates.city_slug/city_name
--      are kept as they were (the "primary" city, for simple display in
--      the admin list table and backward compatibility with any existing
--      row) but publishing/unpublishing now reads the full target list
--      from this table, which is backfilled below from every existing
--      city-scoped candidate so old and new rows behave identically.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- (Same manual-apply process as every other migration in this repo.)

ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS reviewed_by text;

CREATE TABLE IF NOT EXISTS public.news_candidate_cities (
  candidate_id uuid NOT NULL REFERENCES public.news_candidates(id) ON DELETE CASCADE,
  city_slug    text NOT NULL,
  city_name    text NOT NULL,
  PRIMARY KEY (candidate_id, city_slug)
);

CREATE INDEX IF NOT EXISTS news_candidate_cities_candidate_idx ON public.news_candidate_cities (candidate_id);

ALTER TABLE public.news_candidate_cities ENABLE ROW LEVEL SECURITY;
-- Same pattern as news_candidates itself: no policies, service role only
-- (every /admin/news server action uses createAdminClient()).

-- Backfill: every existing city-scoped candidate gets one row here matching
-- its existing single city_slug/city_name, so publish/unpublish logic can
-- read exclusively from this table going forward regardless of whether a
-- candidate was created before or after this migration.
INSERT INTO public.news_candidate_cities (candidate_id, city_slug, city_name)
SELECT id, city_slug, city_name
FROM public.news_candidates
WHERE scope_type = 'city' AND city_slug IS NOT NULL AND city_name IS NOT NULL
ON CONFLICT (candidate_id, city_slug) DO NOTHING;
