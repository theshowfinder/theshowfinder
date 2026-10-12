-- Link upcoming West End performances to their See Tickets run page.
--
-- See Tickets sells West End shows as tour pages that are not in its product
-- feed, so the feed matcher never sets events.see_tickets_affiliate_url for
-- them. Mapping mirrors src/lib/seeTicketsWestEnd.ts — keep the two in step.
-- Only rows with no See Tickets link yet are touched, and the daily matcher
-- never overwrites an existing value.
--
-- Step 1: run the SELECT to preview. Step 2: run the UPDATE.

-- ── Preview ───────────────────────────────────────────────────────────────
with m(title_key, venue_key, url) as (values
  ('the play that goes wrong', 'duchess', 'https://www.seetickets.com/n/tour/the-play-that-goes-wrong/1'),
  ('witness for the prosecution', 'county hall', 'https://www.seetickets.com/n/tour/witness-for-the-prosecution-county-hall/1217'),
  ('harry potter and the cursed child', 'palace', 'https://www.seetickets.com/n/tour/harry-potter-and-the-cursed-child-one-part/1270'),
  ('the devil wears prada', 'dominion', 'https://www.seetickets.com/n/tour/the-devil-wears-prada/743'),
  ('sinatra', 'aldwych', 'https://www.seetickets.com/n/tour/sinatra-the-musical/1176'),
  ('mamma mia', 'novello', 'https://www.seetickets.com/n/tour/mamma-mia-/1023'),
  ('hamilton', 'victoria palace', 'https://www.seetickets.com/n/tour/hamilton/1002'),
  ('oliver', 'gielgud', 'https://www.seetickets.com/n/tour/oliver-/1024'),
  ('miss saigon', 'prince edward', 'https://www.seetickets.com/n/tour/miss-saigon/1320'),
  ('avenue q', 'shaftesbury', 'https://www.seetickets.com/n/tour/avenue-q/1143'),
  ('amadeus', 'noel coward', 'https://www.seetickets.com/n/tour/amadeus/1328'),
  ('the book of mormon', 'prince of wales', 'https://www.seetickets.com/n/tour/the-book-of-mormon/980'),
  ('dirty dancing', 'prince edward', 'https://www.seetickets.com/n/tour/dirty-dancing-the-classic-story-on-stage/1330'),
  ('beetlejuice', 'prince edward', 'https://www.seetickets.com/n/tour/beetlejuice/1136'),
  ('cirque berserk', 'garrick', 'https://www.seetickets.com/n/tour/cirque-berserk-/1302'),
  ('six', 'vaudeville', 'https://www.seetickets.com/n/tour/six/320')
)
select m.title_key, m.venue_key, count(e.id) as rows_to_update
from m
left join events e
  on e.start_date >= now()
 and e.see_tickets_affiliate_url is null
 and (trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) = m.title_key
      or trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) like m.title_key || ' %')
left join venues v
  on v.id = e.venue_id and lower(v.name) like '%' || m.venue_key || '%' and v.city ilike 'london%'
where e.id is null or v.id is not null
group by 1, 2
order by 1;

-- ── Update ────────────────────────────────────────────────────────────────
with m(title_key, venue_key, url) as (values
  ('the play that goes wrong', 'duchess', 'https://www.seetickets.com/n/tour/the-play-that-goes-wrong/1'),
  ('witness for the prosecution', 'county hall', 'https://www.seetickets.com/n/tour/witness-for-the-prosecution-county-hall/1217'),
  ('harry potter and the cursed child', 'palace', 'https://www.seetickets.com/n/tour/harry-potter-and-the-cursed-child-one-part/1270'),
  ('the devil wears prada', 'dominion', 'https://www.seetickets.com/n/tour/the-devil-wears-prada/743'),
  ('sinatra', 'aldwych', 'https://www.seetickets.com/n/tour/sinatra-the-musical/1176'),
  ('mamma mia', 'novello', 'https://www.seetickets.com/n/tour/mamma-mia-/1023'),
  ('hamilton', 'victoria palace', 'https://www.seetickets.com/n/tour/hamilton/1002'),
  ('oliver', 'gielgud', 'https://www.seetickets.com/n/tour/oliver-/1024'),
  ('miss saigon', 'prince edward', 'https://www.seetickets.com/n/tour/miss-saigon/1320'),
  ('avenue q', 'shaftesbury', 'https://www.seetickets.com/n/tour/avenue-q/1143'),
  ('amadeus', 'noel coward', 'https://www.seetickets.com/n/tour/amadeus/1328'),
  ('the book of mormon', 'prince of wales', 'https://www.seetickets.com/n/tour/the-book-of-mormon/980'),
  ('dirty dancing', 'prince edward', 'https://www.seetickets.com/n/tour/dirty-dancing-the-classic-story-on-stage/1330'),
  ('beetlejuice', 'prince edward', 'https://www.seetickets.com/n/tour/beetlejuice/1136'),
  ('cirque berserk', 'garrick', 'https://www.seetickets.com/n/tour/cirque-berserk-/1302'),
  ('six', 'vaudeville', 'https://www.seetickets.com/n/tour/six/320')
)
update events e
   set see_tickets_affiliate_url = m.url
  from m, venues v
 where v.id = e.venue_id
   and v.city ilike 'london%'
   and lower(v.name) like '%' || m.venue_key || '%'
   and e.start_date >= now()
   and e.see_tickets_affiliate_url is null
   and (trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) = m.title_key
        or trim(regexp_replace(lower(e.title), '[^a-z0-9]+', ' ', 'g')) like m.title_key || ' %');
