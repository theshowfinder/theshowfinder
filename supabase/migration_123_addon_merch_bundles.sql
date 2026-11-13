-- Migration 123: merch bundles ("Event ticket not included"), T-shirts and the like are not shows.
-- Same rule as src/lib/listingAddons.ts. listed_events_with_venue picks it up automatically. Safe to re-run.
create or replace function public.is_listing_addon(t text) returns boolean
language sql immutable as $$
  select coalesce(t ~* '(do not purchase|tickets? not included|merch(andise)? bundle|t-?shirt)', false)
      or (coalesce(t ~* '(20[0-9]{2}|festival|fest\M|weekender|fayre)', false)
          and coalesce(t ~* '\m(parking|car park|motorbike park|park pass|campervan|caravan|motorhome|trailer park|rv|yurts?|tipi|bell tent|bell for|bell house|bedouin|cabins?|glamping|pods?|lodge|airstream|safari|wagon|hut|tent for|tenthouse|hotel at|souvenir|lockers?|shuttle|transport|upgrade|rip)\M', false)
          and not coalesce(t ~* '\m(show|exhibition)\M', false))
$$;
