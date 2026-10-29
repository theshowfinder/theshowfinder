-- Migration 099: Theatre Tickets Direct (Awin advertiser 1936) product feed, stored as it comes so the matching to
-- West End shows can be built on the real data. One row per product (a show, sometimes a show + meal package).
create table if not exists public.ttd_catalogue (
  id            text primary key,          -- aw_product_id
  name          text not null,
  url           text,                      -- aw_deep_link (our Awin tracking link)
  merchant_url  text,                      -- merchant_deep_link (their plain page)
  price         numeric,                   -- search_price
  image_url     text,
  category      text,
  raw           jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  gone_at       timestamptz,
  matched_event_id uuid references public.events(id) on delete set null,
  match_status  text
);
alter table public.ttd_catalogue enable row level security;
grant select, insert, update, delete on public.ttd_catalogue to service_role;
