-- Migration 140 (26 Nov 2026): outreach from extra mailboxes on separate domains, each warmed up slowly.
-- The mailboxes themselves (address, SMTP host, app password, start date) live in Vercel as OUTREACH_MAILBOXES, never
-- here. This table is only the brake: a mailbox the provider refuses is paused here for the rest of the day.
-- A business emailed from a mailbox has sent_via = 'mbx:<address>', so its follow-up goes from the same mailbox.
create table if not exists public.outreach_mailbox_pauses (
  mailbox text primary key,
  paused_until timestamptz not null,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.outreach_mailbox_pauses enable row level security;
grant select, insert, update, delete on public.outreach_mailbox_pauses to service_role;
