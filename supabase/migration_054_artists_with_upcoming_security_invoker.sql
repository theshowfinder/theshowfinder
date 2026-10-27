-- Already applied to production on 17 Oct 2026 (kept here for history).
-- Apply the view option only when the earlier artist-directory migration created it.
do $body$
begin
  if to_regclass('public.artists_with_upcoming') is not null then
    execute 'alter view public.artists_with_upcoming set (security_invoker = true)';
  end if;
end
$body$;
