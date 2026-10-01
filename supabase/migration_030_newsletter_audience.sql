-- Phase 5A: Audience and Distribution — email audience foundation +
-- newsletter preparation (news_candidates/city_news are untouched; this
-- only adds what's needed for unsubscribe handling and admin-curated
-- newsletter sends).
--
-- Run this whole file once in the Supabase SQL Editor before deploying
-- the Phase 5A code that depends on it (the /unsubscribe page, the admin
-- subscriber dashboard, and the admin newsletter workflow all read/write
-- the columns and table below). Nothing in this file is applied
-- automatically — Chris runs it by hand, per standing instructions.

-- 1) Unsubscribe support for public.subscribers (migration_006/023).
-- A nullable timestamp rather than a boolean: null = currently subscribed,
-- a timestamp = when they unsubscribed, giving a real audit trail (and
-- letting the admin subscriber page show "unsubscribed 3 days ago"
-- instead of just a flag) without a second column.
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;

-- Partial index: the admin subscriber-count queries and the newsletter
-- send's "active recipients" query both filter on
-- `unsubscribed_at is null`, which this index serves directly; it's
-- deliberately not indexed the other way since "who unsubscribed" is
-- never queried at scale.
create index if not exists subscribers_active_idx on public.subscribers (created_at) where unsubscribed_at is null;

-- 2) Newsletters — admin-curated campaigns built from already-approved or
-- already-published news_candidates (see src/lib/newsPublishing.ts). No
-- foreign key on article_ids: a newsletter is a point-in-time curation
-- (headline/summary copied in at send time via the existing Share Kit
-- data, not a live join), and news_candidates rows are never deleted by
-- normal admin workflows, so this is a deliberate simplification rather
-- than a gap — see the article_ids column comment below.
create table if not exists public.newsletters (
  id          uuid        primary key default uuid_generate_v4(),
  subject     text        not null,
  intro       text        not null default '',
  -- The news_candidates.id values selected for this newsletter, in send
  -- order. Not a foreign key array (Postgres can't FK into array
  -- elements) — if a selected candidate is ever deleted, the newsletter
  -- admin UI treats a missing id as "no longer available" rather than
  -- the database enforcing it; this table is a small, admin-only,
  -- low-volume log, not a reporting join target.
  article_ids uuid[]      not null default '{}',
  status      text        not null default 'draft' check (status in ('draft', 'sent')),
  test_sent_at   timestamptz,
  test_sent_to   text,
  sent_at        timestamptz,
  sent_count     integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.newsletters enable row level security;

-- Same "admin only, all access via the service-role key in server
-- actions" pattern as every other admin-only table in this schema
-- (subscribers, news_candidates, sync_log).
create policy "Admin only"
  on public.newsletters
  using (false);

create index if not exists newsletters_status_idx on public.newsletters (status, created_at desc);
