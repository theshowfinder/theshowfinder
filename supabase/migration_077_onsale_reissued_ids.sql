-- Which of these events have a "public on-sale" date that is really a re-release, not a first sale?
-- Ticketmaster sometimes lists a later public on-sale for held seats on a show that has long been on sale
-- (Paul Smith 'Happy', Derby: presale 25-27 Feb, a Premium Package listing on sale 27 Feb, then a public
-- on-sale of 23 Oct on the standard listing). Telling visitors "tickets go on sale 23 Oct" is wrong, so the
-- site treats these as already on sale. Two kinds of evidence:
--   1. the presale ended more than 14 days before the public date;
--   2. the public date is after the show itself (impossible, so Ticketmaster's date is wrong);
--   3. another listing for the same act, venue and UK calendar day (package variants included) went on
--      sale more than 7 days earlier and is already open.
create or replace function show_series_key(p_title text)
returns text language sql immutable as $$
  select lower(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(p_title, ''), '^\s*(venue premium|vip)\s*[-:–]\s*', '', 'i'),
      '\s*[-–]\s*(live lounge|venue premium|vip|hospitality|premium)[^-–]*$', '', 'i'),
    '[^a-zA-Z0-9]', '', 'g'))
$$;

create or replace function onsale_reissued_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from events e
  where e.id = any(p_ids)
    and coalesce(e.public_onsale_start, e.onsale_date) is not null
    and (
      (e.presale_end is not null and coalesce(e.public_onsale_start, e.onsale_date) - e.presale_end > interval '14 days')
      or coalesce(e.public_onsale_start, e.onsale_date) > e.start_date
      or exists (
        select 1 from events s
        where s.venue_id = e.venue_id and s.id <> e.id
          and s.status::text not in ('cancelled', 'postponed')
          and (s.start_date at time zone 'Europe/London')::date = (e.start_date at time zone 'Europe/London')::date
          and show_series_key(s.title) = show_series_key(e.title)
          and coalesce(s.public_onsale_start, s.onsale_date) < coalesce(e.public_onsale_start, e.onsale_date) - interval '7 days'
          and coalesce(s.public_onsale_start, s.onsale_date) < now() - interval '3 days'
      )
    );
$$;

grant execute on function show_series_key(text) to anon, authenticated, service_role;
grant execute on function onsale_reissued_ids(uuid[]) to anon, authenticated, service_role;
