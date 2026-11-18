-- Migration 133: organiser dashboard (/organiser). Sign-in is a signed email link (no passwords); last_link_sent_at
-- stops the sign-in email being sent more than once a minute. organiser_messages logs every email an organiser sends
-- to their ticket holders (limit: 3 per event per day). Safe to re-run.

alter table public.organisers add column if not exists last_link_sent_at timestamptz;

create table if not exists public.organiser_messages (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid not null references public.organisers(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  subject       text not null,
  body          text not null,
  recipients    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists organiser_messages_event_idx on public.organiser_messages (event_id, created_at desc);
alter table public.organiser_messages enable row level security;
revoke all on public.organiser_messages from anon, authenticated;
grant select, insert, update, delete on public.organiser_messages to service_role;
