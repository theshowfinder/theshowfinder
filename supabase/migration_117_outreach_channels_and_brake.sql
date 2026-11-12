-- Outreach on two channels (12 Nov 2026): Resend (up to 60 a day) and Chris's Zoho mailbox (up to 25 a day).
-- sent_via: which channel sent the first email (the follow-up goes the same way, so it threads in their inbox).
-- resend_id: Resend's id for the email, so a bounce or spam complaint (Resend webhook) can be tied to the business.
-- outreach_settings: the automatic brake. A spam complaint stops Resend outreach until Chris resumes it in admin;
-- three hard bounces in a day, or a Zoho sending error, pause that channel for the rest of the day.
alter table public.outreach_prospects add column if not exists sent_via text;
alter table public.outreach_prospects add column if not exists resend_id text;
create index if not exists outreach_prospects_resend_id_idx on public.outreach_prospects (resend_id);

create table if not exists public.outreach_settings (
  id integer primary key default 1 check (id = 1),
  resend_paused_until timestamptz,
  zoho_paused_until timestamptz,
  pause_reason text,
  updated_at timestamptz not null default now()
);
insert into public.outreach_settings (id) values (1) on conflict (id) do nothing;
alter table public.outreach_settings enable row level security;
grant select, insert, update, delete on public.outreach_settings to service_role;   -- Supabase Data API: new tables need explicit grants (30 Oct 2026)
