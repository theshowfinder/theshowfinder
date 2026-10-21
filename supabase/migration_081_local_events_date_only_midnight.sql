-- Data fix (applied 21 Oct 2026): tourist-board pages on the Visit Birmingham / Manchester platform give a
-- date with no time; the sweep had stored those at 12:00 and the site showed a made-up "12:00". The site-wide
-- rule is that midnight UK time = "time not known" (shown as a date only), and the sweep now stores date-only
-- listings at midnight. This moves the existing rows (all of which were exactly 12:00) to midnight on the same day.
update public.events
set start_date = ((start_date at time zone 'Europe/London')::date)::timestamp at time zone 'Europe/London'
where category = 'local'
  and source in ('southampton_council','manchester_council','bristol_council','birmingham_council','belfast_council',
                 'liverpool_council','portsmouth_council','swansea_council','hull_council')
  and to_char(start_date at time zone 'Europe/London', 'HH24:MI:SS') = '12:00:00';
