-- migration_017_enable_rls_spatial_ref_sys.sql
-- Enables RLS on public.spatial_ref_sys, the PostGIS-installed table of
-- coordinate reference system (SRID) definitions.
--
-- Why this is needed:
--   The Supabase security linter flags spatial_ref_sys as having RLS
--   disabled. It's owned by the postgis extension rather than app code,
--   contains only ~8,500 rows of public SRID reference definitions (no
--   business data), and is safe to expose for read-only access. This is
--   Supabase's documented recommended fix for this specific linter warning.
--
-- Scope: this table only. All other public-schema tables already have RLS
-- enabled with correct policies as of migration_016 and were verified via
-- pg_tables / pg_policies before writing this migration.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to spatial_ref_sys" ON public.spatial_ref_sys;

CREATE POLICY "Allow public read access to spatial_ref_sys"
  ON public.spatial_ref_sys FOR SELECT
  TO public
  USING (true);

-- ─── Verification query — run after to confirm ────────────────────────────
-- SELECT tablename, rowsecurity
-- FROM   pg_tables
-- WHERE  schemaname = 'public' AND tablename = 'spatial_ref_sys';
