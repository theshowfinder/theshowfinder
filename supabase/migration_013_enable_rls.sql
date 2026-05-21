-- migration_013_enable_rls.sql
-- Enable Row Level Security on tables added without it, and harden the
-- events_with_venue view to respect RLS on its underlying tables.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- The service role always bypasses RLS, so admin operations are unaffected.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. sync_state — admin-only (used only by server-side cron/admin routes)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.sync_state ENABLE ROW LEVEL SECURITY;

-- No public policies: service role bypasses RLS automatically.
-- Anon/authenticated users cannot read or write sync_state.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. sync_log — admin-only
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.sync_log ENABLE ROW LEVEL SECURITY;

-- No public policies: service role bypasses RLS automatically.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. events_with_venue view — use security_invoker so the view inherits the
--    calling role's RLS context instead of running as the view owner.
--    (Requires PostgreSQL 15+, which Supabase uses.)
-- ──────────────────────────────────────────────────────────────────────────
ALTER VIEW public.events_with_venue SET (security_invoker = true);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Verification query — run this after to confirm all tables have RLS on
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity
-- FROM   pg_tables
-- WHERE  schemaname = 'public'
-- ORDER  BY tablename;
