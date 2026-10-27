-- Already applied to production on 17 Oct 2026 (kept here for history).
-- The artists_with_upcoming view ran with its creator's permissions
-- (Supabase security advisor: security_definer_view, ERROR). It reads only
-- artists, event_artists and events, all of which have public-read policies,
-- so running it as the querying user returns exactly the same rows.
do $
begin
  if to_regclass('public.artists_with_upcoming') is not null then
    execute 'alter view public.artists_with_upcoming set (security_invoker = true)';
  end if;
end
$;
