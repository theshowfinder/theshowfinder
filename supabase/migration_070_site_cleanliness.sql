-- Already applied to the live database (migration "site_cleanliness_report").
-- One-call "is the site clean?" report for the admin morning clean-up. Counts only; changes nothing.
create or replace function public.site_cleanliness()
 returns jsonb
 language sql stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'live_future_events', (select count(*) from events e where e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out')),
    'tm_future_events', (select count(*) from events e where e.ticketmaster_id is not null and e.source is null and e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out','postponed')),
    'tm_not_refreshed_48h', (select count(*) from events e where e.ticketmaster_id is not null and e.source is null and e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out','postponed') and (e.last_synced_at is null or e.last_synced_at < now() - interval '48 hours')),
    'other_source_not_refreshed_48h', (select count(*) from events e where e.source like '%\_council' and e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out','postponed') and (e.last_synced_at is null or e.last_synced_at < now() - interval '48 hours')),
    'gigsberg_links_to_gone_listings', (select count(*) from events e join gigsberg_catalogue_events g on g.url = e.gigsberg_affiliate_url where g.gone_at is not null and e.start_date >= now()),
    'see_tickets_links_to_gone_listings', (select count(*) from events e join see_tickets_catalogue_events s on s.url = e.see_tickets_affiliate_url where s.gone_at is not null and e.start_date >= now()),
    'catalogue_pages_live_but_listing_gone', (select count(*) from events e where e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out') and ((e.source = 'gigsberg' and exists (select 1 from gigsberg_catalogue_events g where g.matched_event_id = e.id and g.gone_at is not null)) or (e.source = 'see_tickets' and exists (select 1 from see_tickets_catalogue_events s where s.matched_event_id = e.id and s.gone_at is not null)))),
    'live_events_with_no_way_to_buy', (select count(*) from events e where e.start_date >= now() and e.status in ('upcoming','on_sale','sold_out') and e.tickets_url is null and e.own_ticket_url is null and e.gigsberg_affiliate_url is null and e.gigsberg_url is null and e.see_tickets_affiliate_url is null and e.viagogo_url is null and e.stubhub_url is null),
    'gigsberg_rows_unseen_48h', (select count(*) from gigsberg_catalogue_events g where g.event_date >= current_date and g.gone_at is null and g.last_seen_at < now() - interval '48 hours'),
    'see_tickets_rows_unseen_48h', (select count(*) from see_tickets_catalogue_events s where s.event_date >= current_date and s.gone_at is null and s.last_seen_at < now() - interval '48 hours')
  )
$function$;
revoke all on function public.site_cleanliness() from anon, authenticated;
