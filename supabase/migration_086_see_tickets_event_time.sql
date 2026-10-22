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

-- Job 3 (22 Oct 2026): the feed's full venue address, used to put each show in the right city (inner-London
-- postcodes -> London; a county given as the city -> the town in the address). Applied live.
alter table public.see_tickets_catalogue_events add column if not exists venue_address text
  generated always as (nullif(trim(raw->>'Tickets:venue_address'), '')) stored;

-- Job 4 (22 Oct 2026): Gigsberg's own category, so imported shows get the right category (Sport / Football,
-- Comedy, Theatre...) instead of a guess from the title. Applied live.
alter table public.gigsberg_catalogue_events add column if not exists type_name text
  generated always as (nullif(trim(raw->>'type_name'), '')) stored;
alter table public.gigsberg_catalogue_events add column if not exists sub_type text
  generated always as (nullif(trim(raw->>'subType'), '')) stored;

-- Data fix (applied): 7 feed-created pages had the wrong category (e.g. "Derby County vs Stoke City" as a concert).
with want as (
  select e.id, case upper(trim(c.genre)) when 'COMEDY' then 'comedy' when 'THEATRE' then 'theatre' when 'SPORT' then 'sports'
    when 'ROCK' then 'concert' when 'POP' then 'concert' when 'OTHER MUSIC' then 'concert' when 'DANCE AND CLUBS' then 'concert' when 'FESTIVAL' then 'concert' end new
  from public.events e join public.see_tickets_catalogue_events c on c.matched_event_id = e.id where e.source = 'see_tickets'
  union all
  select e.id, case when g.sub_type ~* 'conference|speaking|museum|exhibition' then null else case lower(g.type_name)
    when 'concert' then 'concert' when 'festival' then 'concert' when 'comedy' then 'comedy' when 'theatre' then 'theatre' when 'sport' then 'sports' end end
  from public.events e join public.gigsberg_catalogue_events g on g.matched_event_id = e.id where e.source = 'gigsberg')
update public.events e set category = w.new::event_category, updated_at = now() from want w
 where w.id = e.id and w.new is not null and e.category::text <> w.new;

-- Job 5 (22 Oct 2026): the sellers' own text, face-value price and Gigsberg's performer photo, for imported pages.
-- Applied live.
alter table public.see_tickets_catalogue_events add column if not exists feed_description text
  generated always as (nullif(trim(raw->>'description'), '')) stored;
alter table public.see_tickets_catalogue_events add column if not exists search_price text
  generated always as (nullif(trim(raw->>'search_price'), '')) stored;
alter table public.gigsberg_catalogue_events add column if not exists image_url text
  generated always as (nullif(trim(raw->>'image'), '')) stored;
