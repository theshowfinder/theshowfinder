-- migration_033_move_gigsberg_sync_links.sql
-- Move URLs written by the original Gigsberg sync from the generic
-- own_ticket_url column into the provider-specific gigsberg_url column.
-- Run once in Supabase SQL Editor before deploying the corrected sync.

UPDATE public.events AS e
SET
  gigsberg_url = l.ticket_url,
  own_ticket_url = CASE
    WHEN e.own_ticket_url = l.ticket_url THEN NULL
    ELSE e.own_ticket_url
  END
FROM public.gigsberg_event_links AS l
WHERE e.id = l.event_id
  AND (e.gigsberg_url IS NULL OR e.gigsberg_url = l.ticket_url);
