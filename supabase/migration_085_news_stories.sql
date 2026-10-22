-- Our own news stories for newly announced tours and dates ("Sam Fender announces UK stadium dates"), each with
-- an image, a hook headline and an article page at /news/<slug>. Built automatically from our ticket listings
-- after each new-show detection run (src/lib/newsStories.ts); the homepage headline strip shows the newest
-- headline-worthy ones first. The public site reads published rows with the anon key; writes are server-only.
create table if not exists public.news_stories (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  dedupe_key         text not null unique,          -- artist:<artist id>:<yyyy-mm of first detection>
  artist_id          uuid,                          -- artists.id (no FK: adding one needs a lock on artists that the syncs keep busy)
  artist_name        text not null,
  artist_slug        text,
  story_type         text not null default 'tour_announcement', -- tour_announcement | new_dates
  headline           text not null,                 -- the hook shown everywhere
  template_headline  text not null,                 -- plain factual version (fallback, SEO title)
  standfirst         text not null,
  headline_source    text not null default 'template', -- ai | template
  image_url          text,
  image_url_large    text,
  facts              jsonb not null default '{}'::jsonb, -- dates, venues, on-sale/presale snapshot used by the page
  event_ids          uuid[] not null default '{}',
  score              numeric not null default 0,
  is_headline        boolean not null default false, -- good enough for the homepage strip and alert emails
  status             text not null default 'published', -- published | hidden
  published_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  alerted_at         timestamptz,                    -- alert email sent to subscribers
  alert_preview_at   timestamptz                     -- preview alert sent to Chris (preview mode)
);
create index if not exists news_stories_published_idx on public.news_stories (published_at desc) where status = 'published';
create index if not exists news_stories_artist_idx on public.news_stories (artist_id);

alter table public.news_stories enable row level security;
drop policy if exists "Published news stories are public" on public.news_stories;
create policy "Published news stories are public" on public.news_stories
  for select to anon, authenticated using (status = 'published');

revoke insert, update, delete, truncate, references, trigger on public.news_stories from anon, authenticated;
grant select, insert, update, delete on public.news_stories to service_role;
grant select on public.news_stories to anon, authenticated;
