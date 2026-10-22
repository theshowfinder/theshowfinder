-- The See Tickets feed gives each show's local start time inside raw ("Tickets:event_date": "2026-11-21T21:00:00"),
-- but the importer created pages at a made-up 19:00. Expose the real time as a column the importer can select.
-- Generated from raw, so it stays right on every feed refresh; text (not time) so a malformed feed value can never
-- make the feed import fail: it just becomes null (= "time not known").
alter table public.see_tickets_catalogue_events add column if not exists event_time text
  generated always as (
    case when raw->>'Tickets:event_date' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d'
         then substr(raw->>'Tickets:event_date', 12, 5) else null end
  ) stored;

-- Data fix (applied 22 Oct 2026): the 20 See Tickets pages created before this used 19:00 UTC; set the feed's time.
update public.events e
   set start_date = ((c.event_date + c.event_time::time) at time zone 'Europe/London'), updated_at = now()
  from public.see_tickets_catalogue_events c
 where c.matched_event_id = e.id and e.source = 'see_tickets' and c.event_time is not null
   and e.start_date <> ((c.event_date + c.event_time::time) at time zone 'Europe/London');
