-- migration_016_harden_rls.sql
-- Hardens Row Level Security across every table in the public schema.
--
-- Why this is needed:
--   migration_014 and migration_015 both executed
--   DROP VIEW IF EXISTS public.events_with_venue CASCADE
--   then recreated the view — discarding the security_invoker=true setting
--   applied by migration_013. Without security_invoker, the view runs with
--   the definer's (service_role) privileges and silently bypasses RLS on the
--   underlying tables, which Supabase flags as a security warning.
--
--   This migration also re-enables RLS on all tables idempotently and
--   rebuilds every policy cleanly with DROP … IF EXISTS + CREATE POLICY.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

-- ─── 1. Enable RLS on every table (idempotent) ────────────────────────────
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_dates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_artists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log       ENABLE ROW LEVEL SECURITY;

-- ─── 2. profiles — owner-only read/write ─────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─── 3. venues — public read ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Venues are publicly readable" ON public.venues;

CREATE POLICY "Venues are publicly readable"
  ON public.venues FOR SELECT
  USING (true);

-- ─── 4. artists — public read ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Artists are publicly readable" ON public.artists;

CREATE POLICY "Artists are publicly readable"
  ON public.artists FOR SELECT
  USING (true);

-- ─── 5. tours — public read ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read tours" ON public.tours;

CREATE POLICY "Public read tours"
  ON public.tours FOR SELECT
  USING (true);

-- ─── 6. tour_dates — public read ──────────────────────────────────────────
DROP POLICY IF EXISTS "Public read tour_dates" ON public.tour_dates;

CREATE POLICY "Public read tour_dates"
  ON public.tour_dates FOR SELECT
  USING (true);

-- ─── 7. events — public read ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Events are publicly readable" ON public.events;

CREATE POLICY "Events are publicly readable"
  ON public.events FOR SELECT
  USING (true);

-- ─── 8. event_artists — public read ──────────────────────────────────────
DROP POLICY IF EXISTS "Event artists are publicly readable" ON public.event_artists;

CREATE POLICY "Event artists are publicly readable"
  ON public.event_artists FOR SELECT
  USING (true);

-- ─── 9. user_favorites — owner only ──────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own favourites" ON public.user_favorites;
DROP POLICY IF EXISTS "Users can view their own favourites"   ON public.user_favorites;
DROP POLICY IF EXISTS "Users can insert their own favourites" ON public.user_favorites;
DROP POLICY IF EXISTS "Users can delete their own favourites" ON public.user_favorites;

CREATE POLICY "Users can view their own favourites"
  ON public.user_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favourites"
  ON public.user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favourites"
  ON public.user_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 10. subscribers — INSERT for anyone; SELECT/UPDATE/DELETE service-role only
--         Service role bypasses RLS, so no service-role policy is needed.
DROP POLICY IF EXISTS "Admin only"          ON public.subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;

-- Allow anonymous and authenticated users to add their email (newsletter signup)
CREATE POLICY "Anyone can subscribe"
  ON public.subscribers FOR INSERT
  WITH CHECK (true);

-- Explicitly block all row-level reads/updates/deletes for non-service-role callers
CREATE POLICY "No public read on subscribers"
  ON public.subscribers FOR SELECT
  USING (false);

-- ─── 11. sync_state — service-role only (no public policies) ─────────────
-- No policies needed: service role bypasses RLS; all other roles are denied.

-- ─── 12. sync_log — service-role only ────────────────────────────────────
-- No policies needed: service role bypasses RLS; all other roles are denied.

-- ─── 13. Restore security_invoker on events_with_venue view ──────────────
--         Lost when migration_014 and migration_015 dropped and recreated the
--         view without reapplying this setting. Without it the view runs as
--         the definer (service_role) and bypasses RLS on the events table.
ALTER VIEW public.events_with_venue SET (security_invoker = true);
