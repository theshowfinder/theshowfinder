-- migration_026_news_candidates.sql
-- "News Intelligence Inbox" Phase 1 — a manual editorial queue for news the
-- RSS pipeline (src/lib/cityNews.ts) hasn't found yet: presale/tour
-- announcements and other ticket news discovered during manual research.
-- Reviewed here in /admin/news, then published into the existing
-- `city_news` table so it renders through the same public card design.
--
-- This does not change how the RSS sync fetches or filters news. The one
-- small, necessary exception is the `is_editorial` column added to
-- `city_news` at the bottom of this file — see the comment there.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- (This repo has no CLI-linked migration workflow — every migration file
-- here, including this one, is applied by pasting it into the SQL Editor.)

CREATE TABLE IF NOT EXISTS public.news_candidates (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  scope_type                 text        NOT NULL CHECK (scope_type IN ('national', 'city')),
  city_slug                  text,
  city_name                  text,

  headline                   text        NOT NULL,
  source                     text,
  url                        text        NOT NULL,
  published_at               timestamptz,
  discovered_at              timestamptz NOT NULL DEFAULT now(),

  story_type                 text        NOT NULL DEFAULT 'general_entertainment'
                                          CHECK (story_type IN ('presale', 'tour_announcement', 'new_dates', 'venue_news', 'general_entertainment')),

  artist_name                text,
  artist_id                  uuid        REFERENCES public.artists(id) ON DELETE SET NULL,

  summary                    text,
  editorial_note              text,

  priority                   text        NOT NULL DEFAULT 'normal'  CHECK (priority IN ('low', 'normal', 'high')),
  review_status               text        NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'published')),

  reviewed_at                 timestamptz,
  published_to_city_news_at    timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- A city-scoped candidate needs a city; a national one must not have one —
  -- mirrors the NATIONAL_SLUG sentinel city_news already uses for the same
  -- national/city split.
  CONSTRAINT news_candidates_scope_chk CHECK (
    (scope_type = 'city'     AND city_slug IS NOT NULL AND city_name IS NOT NULL) OR
    (scope_type = 'national' AND city_slug IS NULL     AND city_name IS NULL)
  ),

  -- Duplicate protection: the same source URL can't be queued twice.
  CONSTRAINT news_candidates_url_key UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS news_candidates_review_status_idx ON public.news_candidates (review_status);
CREATE INDEX IF NOT EXISTS news_candidates_scope_idx         ON public.news_candidates (scope_type, city_slug);

ALTER TABLE public.news_candidates ENABLE ROW LEVEL SECURITY;
-- No policies needed: service role (used by every /admin/news server
-- action, via createAdminClient()) bypasses RLS; anon/authenticated roles
-- are denied by default with zero policies defined — same pattern as
-- sync_state / sync_log (see migration_016_harden_rls.sql). Candidates are
-- never queried from a public page, so there is no public SELECT policy
-- either.

-- ── city_news: one small additive change needed for publishing to work ────
-- Publishing an approved candidate inserts it as a normal city_news row (see
-- publishNewsCandidateAction in src/app/admin/actions.ts) so it renders
-- through the exact same public card design — no second news system.
--
-- But syncCityNews's daily RSS run prunes any city_news row for a feed that
-- isn't in that day's fresh RSS results (src/lib/cityNews.ts, syncOneFeed).
-- A manually-published editorial row will never appear in an RSS fetch, so
-- without a marker it would be silently deleted on the very next sync —
-- typically within 24 hours. is_editorial flags a row as manually published
-- so the prune step can skip it (that filter change ships alongside this
-- migration in cityNews.ts). This does not change pruning for any existing
-- RSS-sourced row: every row the RSS pipeline writes already gets
-- is_editorial = false via the column default, so its prune behaviour is
-- unchanged.
ALTER TABLE public.city_news ADD COLUMN IF NOT EXISTS is_editorial boolean NOT NULL DEFAULT false;
