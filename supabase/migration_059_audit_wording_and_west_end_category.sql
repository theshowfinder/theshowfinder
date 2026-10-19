-- 19 Oct 2026 site audit follow-up. Both statements were already run in production.
-- 1. The stored "About this event" sentence claimed price comparison across Viagogo/StubHub.
--    No prices are compared, so it now says what the site does.
update events
set description = replace(description,
  'Compare ticket prices across Ticketmaster, Viagogo, StubHub and more with TheShowFinder.',
  'Find tickets from official sellers on TheShowFinder.')
where description like '%Compare ticket prices across Ticketmaster, Viagogo, StubHub and more with TheShowFinder.%';

-- 2. Ticketmaster tags some West End plays with a Comedy genre; keep the hand-checked West End
--    shows (src/lib/seeTicketsWestEnd.ts) under Theatre. The sync now does the same (mapCategory).
with w(t, v) as (values
  ('the play that goes wrong','duchess'),('witness for the prosecution','county hall'),
  ('harry potter and the cursed child','palace'),('the devil wears prada','dominion'),('sinatra','aldwych'),
  ('mamma mia','novello'),('hamilton','victoria palace'),('oliver','gielgud'),('miss saigon','prince edward'),
  ('avenue q','shaftesbury'),('amadeus','noel coward'),('the book of mormon','prince of wales'),
  ('dirty dancing','prince edward'),('beetlejuice','prince edward'),('cirque berserk','garrick'),('six','vaudeville'))
update events e set category = 'theatre'
from venues v, w
where v.id = e.venue_id and e.category = 'comedy' and lower(v.name) like '%' || w.v || '%'
  and (trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) = w.t
    or trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) like w.t || ' %');
