-- Already applied to the live database (migration "fill_artist_images_from_twins").
-- Artists created from other feeds (Gigsberg / See Tickets fixtures) have no photo. If another artist record
-- has the same name (ignoring punctuation and a trailing FC/AFC/CF) and a photo, borrow it. Only fills blanks.
create or replace function public.fill_artist_images_from_twins()
 returns integer
 language sql
 set search_path to 'public'
as $function$
  with norm as (
    select id, name, image_url,
           regexp_replace(lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')), '\s+(fc|afc|cf)$', '') n
    from artists
  ),
  pick as (
    select distinct on (a.id) a.id, b.image_url
    from norm a join norm b on a.n = b.n and a.id <> b.id
    where a.image_url is null and b.image_url is not null
    order by a.id, b.name
  ),
  done as (
    update artists t set image_url = pick.image_url from pick where t.id = pick.id and t.image_url is null returning 1
  )
  select count(*)::int from done
$function$;
revoke all on function public.fill_artist_images_from_twins() from anon, authenticated;
