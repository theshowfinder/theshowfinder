-- One row per "Just announced" alert email sent to a subscriber: which stories, when.
-- Used to never send a story twice and to cap alerts (1 a day, 3 a week). Written by /api/cron/news-alerts.
create table if not exists public.subscriber_alerts (
  id bigint generated always as identity primary key,
  email text not null,
  story_ids uuid[] not null,
  reasons text[] not null default '{}',
  sent_at timestamptz not null default now()
);
create index if not exists subscriber_alerts_email_idx on public.subscriber_alerts (email, sent_at desc);
alter table public.subscriber_alerts enable row level security;
grant select, insert, update, delete on public.subscriber_alerts to service_role;   -- Supabase Data API: new tables need explicit grants (30 Oct 2026)
