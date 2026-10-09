-- Gigsberg availability, promotion and image provenance.
alter table public.events
  add column if not exists gigsberg_highlighted boolean not null default false,
  add column if not exists gigsberg_highlight_until timestamptz,
  add column if not exists gigsberg_inventory_status text,
  add column if not exists gigsberg_inventory_checked_at timestamptz;

alter table public.gigsberg_catalogue_events
  add column if not exists inventory_status text not null default 'unknown',
  add column if not exists inventory_checked_at timestamptz,
  add column if not exists image_status text not null default 'pending';

create index if not exists events_gigsberg_highlight_idx
  on public.events (gigsberg_highlighted, gigsberg_highlight_until)
  where gigsberg_highlighted = true;
