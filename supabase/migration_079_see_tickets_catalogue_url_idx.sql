-- /out/st looks up the plain See Tickets page for a feed link (awin1.com/pclick.php)
-- when the request is from a bot, so bots never reach Awin. That lookup is by url.
-- Index only: no new table or view, so no grants are needed.
create index if not exists see_tickets_catalogue_url_idx on public.see_tickets_catalogue_events (url);
