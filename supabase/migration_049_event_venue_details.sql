-- Practical event/venue facts from Ticketmaster (support acts, age limit,
-- parking, access) used to build the event page "plan your night" content.
-- doors_time already exists on events; the sync now fills it.
alter table public.events add column if not exists details jsonb;
alter table public.venues add column if not exists details jsonb;
