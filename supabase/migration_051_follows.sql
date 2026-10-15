-- "Follow an artist or venue": one row per (email, artist/venue). A daily job
-- emails each address when new shows are added for anything they follow, then
-- moves last_notified_at forward. Only the server (service role) touches this
-- table: RLS is on with no policies, so the public API key cannot read or write
-- it. unsubscribed_at is set by the unsubscribe page (all follows for that
-- address). Safe to re-run.
create table if not exists public.follows (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  kind             text not null check (kind in ('artist', 'venue')),
  target_id        uuid not null,                         -- artists.id or venues.id, by kind
  source           text,                                  -- where they followed: artist, venue, event, ...
  created_at       timestamptz not null default now(),
  last_notified_at timestamptz not null default now(),    -- only shows added after this are announced
  unsubscribed_at  timestamptz,
  unique (email, kind, target_id)
);

create index if not exists follows_active_idx on public.follows (kind, target_id) where unsubscribed_at is null;
create index if not exists follows_email_idx  on public.follows (email);

alter table public.follows enable row level security;
