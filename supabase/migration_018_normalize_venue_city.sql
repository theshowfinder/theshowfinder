-- Migration 018: Normalize venues.city
--
-- Ticketmaster's venue.city.name is inconsistent in ways that silently broke
-- the /cities/[city] pages (which match on an exact, trimmed city name):
--   - stray leading/trailing whitespace ("Norwich ", " London") -- by far the
--     most common case, present across dozens of cities
--   - the full official name where our CITIES list uses the short form
--     ("Newcastle upon Tyne" / "Newcastle Upon Tyne" vs "Newcastle") -- this
--     one alone was hiding over 1,200 upcoming Newcastle events
--   - an appended postcode ("Newcastle upon Tyne, NE1 2PQ")
--
-- This is a one-time backfill for rows written before the sync's venue
-- upsert started normalizing city names at write time (see
-- normalizeCityName() in src/lib/ticketmaster.ts). Safe to run more than
-- once -- it's idempotent.

-- Step 1: trim/collapse whitespace, drop a trailing UK postcode, drop a
-- now-dangling trailing comma.
UPDATE venues
SET city = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(btrim(city), '\s+', ' ', 'g'),
      ',?\s*[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\s*[0-9][A-Za-z]{2}$', '', 'i'
    ),
    ',\s*$', ''
  )
)
WHERE city IS NOT NULL;

-- Step 2: canonicalize every "Newcastle upon Tyne" variant (any case,
-- already stripped of any postcode by step 1) to "Newcastle", matching the
-- short form used in src/lib/cities.ts. Does not touch "Newcastle Under
-- Lyme", which is a genuinely different town near Stoke-on-Trent.
UPDATE venues
SET city = 'Newcastle'
WHERE lower(btrim(city)) = 'newcastle upon tyne';
