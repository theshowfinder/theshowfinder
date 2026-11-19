-- Migration 137: one block list for every email we send (newsletter, advertiser, backlink and organiser outreach).
-- Admin → Unsubscribes adds an address; existing rows are marked unsubscribed there, and these triggers stop
-- the finders re-adding it later (a new prospect with a blocked address arrives already unsubscribed).

create table if not exists public.email_blocklist (
  email      text primary key check (email = lower(email)),
  reason     text,
  created_at timestamptz not null default now()
);
alter table public.email_blocklist enable row level security;
grant select, insert, update, delete on public.email_blocklist to service_role;

create or replace function public.apply_email_blocklist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.email_blocklist b where b.email = lower(new.email)) then
    if tg_table_name = 'subscribers' then
      new.unsubscribed_at := coalesce(new.unsubscribed_at, now());
    else
      new.status := 'unsubscribed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists email_blocklist_guard on public.outreach_prospects;
create trigger email_blocklist_guard before insert or update of email, status on public.outreach_prospects
  for each row execute function public.apply_email_blocklist();
drop trigger if exists email_blocklist_guard on public.link_prospects;
create trigger email_blocklist_guard before insert or update of email, status on public.link_prospects
  for each row execute function public.apply_email_blocklist();
drop trigger if exists email_blocklist_guard on public.organiser_prospects;
create trigger email_blocklist_guard before insert or update of email, status on public.organiser_prospects
  for each row execute function public.apply_email_blocklist();
drop trigger if exists email_blocklist_guard on public.subscribers;
create trigger email_blocklist_guard before insert or update of email, unsubscribed_at on public.subscribers
  for each row execute function public.apply_email_blocklist();
