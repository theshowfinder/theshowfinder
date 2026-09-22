-- migration_018_own_ticket_url.sql
-- Adds own_ticket_url to public.events — the URL of a listing on a resale
-- marketplace (Viagogo, StubHub, etc.) when the site owner personally holds
-- tickets for that event. Nullable: most events have no self-held tickets.
--
-- Populated manually via the admin panel. Read by /go/[slug] to decide
-- whether to redirect straight to the listing or fall back to the event page.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS own_ticket_url text;
