-- Gigsberg matching used to ignore showtimes, so a 3:30pm and a 7:30pm listing
-- for the same act, venue and day could both be linked to the one 7:30pm event.
-- This sends any such automatic link back to the matcher (status 'pending') so it
-- is re-decided with the showtime-aware rules. Loop-proof: rows re-decided by the
-- new matcher carry "[time checked" in match_reason and are skipped. Manual links
-- (approved_existing) are never touched. Called at the start of every matcher run.
create or replace function gigsberg_reset_time_mismatches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row_ids bigint[];
  event_ids uuid[];
  n integer;
begin
  select coalesce(array_agg(bad.id), '{}'), coalesce(array_agg(distinct bad.matched_event_id), '{}')
    into row_ids, event_ids
  from (
    select gc.id, gc.matched_event_id
    from gigsberg_catalogue_events gc
    join events e on e.id = gc.matched_event_id
    where gc.gone_at is null
      and gc.match_status = 'auto_matched'
      and gc.event_time is not null and gc.event_time <> '00:00'
      and coalesce(gc.match_reason, '') not like '%[time checked%'
      and abs(extract(epoch from gc.event_time) / 60
            - (extract(hour from (e.start_date at time zone 'Europe/London')) * 60
             + extract(minute from (e.start_date at time zone 'Europe/London')))) > 45
      and exists (
        select 1 from gigsberg_catalogue_events s
        where s.id <> gc.id and s.gone_at is null and s.event_date = gc.event_date
          and lower(s.venue) = lower(gc.venue) and s.event_time is not null)
  ) bad;

  n := coalesce(array_length(row_ids, 1), 0);
  if n = 0 then return 0; end if;

  -- Remove the button only where it came from one of these rows.
  update events e set gigsberg_affiliate_url = null
  from gigsberg_catalogue_events g
  where g.id = any(row_ids) and e.id = g.matched_event_id and e.gigsberg_affiliate_url = g.url;

  update gigsberg_catalogue_events
  set match_status = 'pending', matched_event_id = null, match_checked_at = null
  where id = any(row_ids);

  -- An event that lost its button but still has a correctly matched listing gets that one back.
  update events e set gigsberg_affiliate_url = g.url
  from gigsberg_catalogue_events g
  where g.matched_event_id = e.id and g.match_status = 'auto_matched' and g.gone_at is null
    and e.id = any(event_ids) and e.gigsberg_affiliate_url is null;

  return n;
end;
$$;

revoke all on function gigsberg_reset_time_mismatches() from public, anon, authenticated;
grant execute on function gigsberg_reset_time_mismatches() to service_role;
