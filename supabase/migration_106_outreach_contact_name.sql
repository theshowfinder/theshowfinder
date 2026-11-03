-- Outreach (3 Nov 2026): optional contact first name for the greeting ("Hi Sam,"); otherwise "Hi there,".
-- Statuses now: to_check | approved | sent | followed_up | replied | interested | onboarding | won | no_response |
-- not_interested | unsubscribed | bounced (free text, set by the admin page and the sender).
alter table public.outreach_prospects add column if not exists contact_name text;
grant select, insert, update, delete on public.outreach_prospects to service_role;
