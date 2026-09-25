-- migration_021_city_news.sql
-- Local entertainment news headlines per city, pulled from Google News RSS by
-- the daily sync-city-news cron (03:00 UTC, one hour after the Ticketmaster
-- sync) and rendered above the Featured/On Sale sections on each city page.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- (This repo has no CLI-linked migration workflow — every migration file
-- here, including this one, is applied by pasting it into the SQL Editor.)

CREATE TABLE IF NOT EXISTS public.city_news (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug     text        NOT NULL,
  city_name     text        NOT NULL,
  headline      text        NOT NULL,
  url           text        NOT NULL,
  source        text,
  published_at  timestamptz,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_slug, url)
);

CREATE INDEX IF NOT EXISTS city_news_city_slug_idx ON public.city_news (city_slug);

ALTER TABLE public.city_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "City news is publicly readable" ON public.city_news;

CREATE POLICY "City news is publicly readable"
  ON public.city_news FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy — only the service role (used by the
-- sync-city-news cron) can write, matching the pattern used for
-- local_businesses / artists / events / venues.
