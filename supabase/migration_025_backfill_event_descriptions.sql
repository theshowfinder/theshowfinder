-- One-time data backfill (run directly via Supabase SQL Editor on
-- 2026-09-29, since the app's network egress can't reach Supabase's
-- REST API directly from the automation sandbox — see project notes).
--
-- Every event synced before src/lib/ticketmaster.ts started writing a
-- `description` field had description IS NULL (54,943 of 54,959 events).
-- This mirrors buildFallbackDescription() in src/lib/eventDescription.ts
-- exactly, so backfilled rows read identically to what new syncs will
-- produce going forward. Only touches rows where description is still
-- null/empty, so hand-written or scraper-supplied descriptions (e.g. the
-- Derby council events, which already carry their own schema.org
-- description) are left untouched.
update events
set description =
  (case category
     when 'concert' then 'See ' || title || ' live'
     when 'theatre' then 'Watch ' || title || ' live on stage'
     when 'comedy'  then 'See ' || title || ' live'
     when 'sports'  then 'Watch ' || title
     when 'family'  then 'Bring the family to ' || title
     when 'local'   then 'Join ' || title
     else 'See ' || title || ' live'
   end)
  || ' at ' ||
  coalesce(
    (select case
       when v.name is not null and v.city is not null and v.city <> v.name then v.name || ', ' || v.city
       when v.name is not null then v.name
       when v.city is not null then v.city
     end
     from venues v where v.id = events.venue_id),
    'the UK'
  )
  || ' on ' || to_char(start_date, 'FMDay, FMDD FMMonth YYYY')
  || '. Compare ticket prices across Ticketmaster, Viagogo, StubHub and more with TheShowFinder.'
where description is null or description = '';
