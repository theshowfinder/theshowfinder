-- Migration 098: news stories for a city page. A story belongs to a city when any of its shows is an upcoming show
-- in that city (29 Oct 2026: matching only the ~50 shows already on the page found a story for few cities, although
-- Manchester alone had 69 recent stories about its shows). Newest first.
create or replace function public.city_story_ids(p_city text, p_days int default 60, p_limit int default 20)
returns table(id uuid)
language sql stable
as $$
  select s.id
  from public.news_stories s
  where s.status = 'published'
    and s.published_at > now() - make_interval(days => p_days)
    and exists (
      select 1 from public.events e join public.venues v on v.id = e.venue_id
      where e.id = any(s.event_ids) and e.start_date > now() and e.merged_into is null and v.city ilike p_city
    )
  order by s.published_at desc
  limit greatest(p_limit, 1)
$$;
grant execute on function public.city_story_ids(text, int, int) to anon, authenticated, service_role;
