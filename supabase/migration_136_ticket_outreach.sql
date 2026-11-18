-- Migration 136: ticket-selling outreach, separate from backlinks. Organisers found by the organiser finder get a
-- short email about selling their tickets with us; each one waits for Chris's approval on /admin/organisers.
-- One follow-up after 7 days; bounces and spam complaints trip the same brake as other outreach. Safe to re-run.
alter table public.organiser_prospects add column if not exists unsubscribe_token text not null default replace(gen_random_uuid()::text, '-', '');
alter table public.organiser_prospects add column if not exists approved_at timestamptz;
alter table public.organiser_prospects add column if not exists sent_at timestamptz;
alter table public.organiser_prospects add column if not exists followed_up_at timestamptz;
alter table public.organiser_prospects add column if not exists replied_at timestamptz;
alter table public.organiser_prospects add column if not exists sent_via text;
alter table public.organiser_prospects add column if not exists resend_id text;
alter table public.organiser_prospects add column if not exists last_error text;
create index if not exists organiser_prospects_resend_idx on public.organiser_prospects (resend_id) where resend_id is not null;
create unique index if not exists organiser_prospects_unsub_idx on public.organiser_prospects (unsubscribe_token);

-- Backlink outreach is venues only now: organiser drafts move to ticket outreach.
update public.link_prospects set status = 'skipped', notes = 'Moved to ticket-selling outreach (/admin/organisers)', updated_at = now()
  where kind = 'organiser' and status in ('ready', 'no_email', 'approved');
