-- See Tickets affiliate links attached to public Showfinder events.
alter table public.events
  add column if not exists see_tickets_affiliate_url text;

create index if not exists events_see_tickets_affiliate_url_idx
  on public.events (see_tickets_affiliate_url)
  where see_tickets_affiliate_url is not null;
