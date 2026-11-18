-- Migration 135: more backlink outreach, safely. Which channel sent each email (Resend or Chris's Zoho mailbox) and
-- Resend's id, so bounces and spam complaints on backlink emails trip the same brake as advertiser outreach. Safe to re-run.
alter table public.link_prospects add column if not exists sent_via text;
alter table public.link_prospects add column if not exists resend_id text;
create index if not exists link_prospects_resend_idx on public.link_prospects (resend_id) where resend_id is not null;
alter table public.link_prospects drop constraint if exists link_prospects_status_check;
alter table public.link_prospects add constraint link_prospects_status_check check (status in ('found', 'no_site', 'no_email', 'ready', 'approved', 'sent', 'followed_up', 'replied', 'linked', 'declined', 'skipped', 'unsubscribed', 'failed', 'bounced'));
