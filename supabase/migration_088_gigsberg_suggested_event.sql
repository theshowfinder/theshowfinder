-- The matcher's best guess for a Gigsberg listing it is not sure about ('review'), so the admin screens can offer
-- it as a one-click "Approve". Before this the guess only existed as text in match_reason. Applied live 22 Oct 2026.
alter table public.gigsberg_catalogue_events add column if not exists suggested_event_id uuid;
