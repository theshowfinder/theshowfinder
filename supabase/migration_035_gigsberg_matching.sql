-- Affiliate links from the Gigsberg integration API are separate from the
-- existing seller-inventory Gigsberg links.
alter table public.events
  add column if not exists gigsberg_affiliate_url text;

alter table public.gigsberg_catalogue_events
  add column if not exists match_status text not null default 'pending';
alter table public.gigsberg_catalogue_events
  add column if not exists match_confidence numeric;
alter table public.gigsberg_catalogue_events
  add column if not exists match_reason text;
alter table public.gigsberg_catalogue_events
  add column if not exists match_checked_at timestamptz;

create index if not exists gigsberg_catalogue_match_status_idx
  on public.gigsberg_catalogue_events (match_status);
