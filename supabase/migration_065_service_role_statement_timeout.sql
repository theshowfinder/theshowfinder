-- Already applied to the live database (migration "service_role_statement_timeout_60s").
-- PostgREST applies per-role settings to each request. service_role had none, so server-side
-- cron calls inherited the authenticator's 8s statement_timeout. refresh_event_canonical() now
-- takes ~4.5s on its own (28k live events) and exceeded 8s whenever the Ticketmaster sweep was
-- writing, which made the "Refresh listings" job fail with "canceling statement due to statement timeout".
alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';
