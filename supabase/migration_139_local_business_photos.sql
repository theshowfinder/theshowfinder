-- Migration 139: advertiser photos on listings. When an application is approved, the photos the business uploaded
-- (private advertiser-assets bucket) are copied to the public business-logos bucket and their public addresses are
-- stored here, so the city guide and the "Before the show" box can show the business's own pictures.
alter table public.local_businesses add column if not exists photo_urls text[] not null default '{}';
