-- Migration 089: "<Show> - Restaurant" (and "- Dining") listings are a restaurant-table ticket for the show,
-- not a second show. Ticketmaster/TicketWeb list them separately at Jazz Cafe and similar venues
-- (e.g. "The Kilimanjaro Darkjazz Ensemble - Restaurant"), so they appeared twice on the site.
-- They now count as packages of the main show (hidden from listings, offered as a ticket type on its page).
-- Applied to the live database on 22 Oct 2026. Safe to re-run: it does nothing once applied.
do $$
declare d text;
begin
  d := pg_get_viewdef('public.event_canonical_calc'::regclass, true);
  if position('restaurant|dining' in d) > 0 then return; end if;
  d := replace(d, 'merch bundle)''', 'merch bundle|^\s*(restaurant|dining)(\s+(tickets?|tables?))?\s*$)''');
  execute 'create or replace view public.event_canonical_calc as ' || d;
end $$;

grant select on public.event_canonical_calc to service_role;

select public.refresh_event_canonical();
