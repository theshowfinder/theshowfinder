-- "Remind me when tickets go on sale": one row per (email, event). A daily job
-- emails each address once, up to 24 hours before the on-sale time, then stamps
-- sent_at. Only the server (service role) touches this table: RLS is on with
-- no policies, so the public API key cannot read or write it. Safe to re-run.
create table if not exists public.event_reminders (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  event_id   uuid not null references public.events(id) on delete cascade,
  source     text,                                  -- where it was asked: event, saved, ...
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  unique (email, event_id)
);

create index if not exists event_reminders_pending_idx on public.event_reminders (event_id) where sent_at is null;

alter table public.event_reminders enable row level security;
