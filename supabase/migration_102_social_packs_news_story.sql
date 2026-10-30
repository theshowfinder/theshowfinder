-- Social posts can now be made from our own news stories (news_stories), not only news candidates and events.
alter table public.social_packs drop constraint if exists social_packs_source_type_check;
alter table public.social_packs add constraint social_packs_source_type_check
  check (source_type in ('news_candidate', 'news_story', 'event'));
