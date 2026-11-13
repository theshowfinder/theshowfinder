-- Automatic Social Packs (13 Nov 2026, cron social-auto): list posts ("On sale this week", "This weekend in <city>")
-- and featured-partner posts are new pack sources.
alter table public.social_packs drop constraint if exists social_packs_source_type_check;
alter table public.social_packs add constraint social_packs_source_type_check
  check (source_type in ('news_candidate', 'news_story', 'event', 'roundup', 'partner'));
