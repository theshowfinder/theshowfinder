-- Ensure the artist directory view exists before applying the security-invoker option.
-- Preview branches can have an incomplete historical migration set.
do $body$
begin
  if to_regclass('public.artists_with_upcoming') is null then
    execute $view$
      create view public.artists_with_upcoming as
      select
        a.id,
        a.name,
        a.slug,
        a.image_url,
        a.genre,
        count(distinct e.id)::int as upcoming_count,
        min(e.start_date) as next_date
      from public.artists a
      join public.event_artists ea on ea.artist_id = a.id
      join public.events e on e.id = ea.event_id
      where e.start_date >= now()
        and e.status in ('upcoming', 'on_sale', 'sold_out')
      group by a.id
    $view$;
    execute 'grant select on public.artists_with_upcoming to anon, authenticated';
  end if;

  execute 'alter view public.artists_with_upcoming set (security_invoker = true)';
end
$body$;
