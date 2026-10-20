-- Numbers for the admin "Feeds & matching" page (already applied to the live database).
-- feed_overlap(): how many live upcoming site events carry each combination of Ticketmaster / Gigsberg / See Tickets.
-- affiliate_link_audit(): are the stored buy links on the expected hosts / carrying our tracking code.

create or replace function public.feed_overlap()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total',      count(*),
    'all3',       count(*) filter (where tm and gb and st),
    'tm_gb',      count(*) filter (where tm and gb and not st),
    'tm_st',      count(*) filter (where tm and st and not gb),
    'gb_st',      count(*) filter (where gb and st and not tm),
    'tm_only',    count(*) filter (where tm and not gb and not st),
    'gb_only',    count(*) filter (where gb and not tm and not st),
    'st_only',    count(*) filter (where st and not tm and not gb),
    'none',       count(*) filter (where not tm and not gb and not st)
  )
  from (
    select (ticketmaster_id is not null) as tm,
           (gigsberg_affiliate_url is not null) as gb,
           (see_tickets_affiliate_url is not null) as st
    from public.events
    where start_date >= now() and status in ('upcoming', 'on_sale', 'sold_out')
  ) e
$$;

create or replace function public.affiliate_link_audit()
returns jsonb language sql stable as $$
  with e as (
    select tickets_url, gigsberg_affiliate_url, see_tickets_affiliate_url, own_ticket_url, viagogo_url, stubhub_url
    from public.events
    where start_date >= now() and status in ('upcoming', 'on_sale', 'sold_out')
  ), tmhosts as (
    select substring(tickets_url from '^https?://([^/]+)') as host, count(*) as n
    from e
    where tickets_url is not null and tickets_url !~* '^https?://([^/]+\.)?ticketmaster\.'
    group by 1 order by 2 desc limit 8
  )
  select jsonb_build_object(
    'tm_links',            count(*) filter (where tickets_url is not null),
    'tm_wrong_host',       count(*) filter (where tickets_url is not null and tickets_url !~* '^https?://([^/]+\.)?ticketmaster\.'),
    'tm_other_hosts',      coalesce((select jsonb_agg(jsonb_build_object('host', host, 'n', n)) from tmhosts), '[]'::jsonb),
    'gb_links',            count(*) filter (where gigsberg_affiliate_url is not null),
    'gb_wrong_host',       count(*) filter (where gigsberg_affiliate_url is not null and gigsberg_affiliate_url !~* '^https?://([^/]+\.)?gigsberg\.com'),
    'gb_other_aff',        count(*) filter (where gigsberg_affiliate_url ~* '^https?://([^/]+\.)?gigsberg\.com' and gigsberg_affiliate_url ~* '[?&]aff=' and gigsberg_affiliate_url !~* '[?&]aff=showfinder(&|$)'),
    'st_links',            count(*) filter (where see_tickets_affiliate_url is not null),
    'st_wrong_host',       count(*) filter (where see_tickets_affiliate_url is not null and see_tickets_affiliate_url !~* '(seetickets\.com|awin1\.com)'),
    'no_button_at_all',    count(*) filter (where tickets_url is null and gigsberg_affiliate_url is null and see_tickets_affiliate_url is null and own_ticket_url is null and viagogo_url is null and stubhub_url is null)
  )
  from e
$$;
