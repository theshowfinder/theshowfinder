-- migration_031_social_packs.sql
-- Phase 7 — the Social Pack: a manual-review admin feature that prepares
-- (never posts) Facebook/Instagram/TikTok drafts once an approved
-- Manchester news story is published, or when an admin manually flags a
-- Manchester event worth promoting. Nothing in this table or the code
-- that reads/writes it ever calls Facebook, Instagram or TikTok's API —
-- every row is copy-and-paste-and-post-by-hand, the same philosophy as
-- the existing Share Kit (src/app/admin/news/ShareKit.tsx), just with a
-- durable status (Draft → Ready for review → Approved → Posted) that
-- client-only React state can't provide.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- (This repo has no CLI-linked migration workflow — every migration file
-- here, including this one, is applied by pasting it into the SQL Editor.)

CREATE TABLE IF NOT EXISTS public.social_packs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this pack is promoting. source_id is NOT a foreign key on
  -- purpose: it points at either news_candidates.id or events.id
  -- depending on source_type, and Postgres has no "polymorphic FK" —
  -- the application layer (src/lib/socialPack.ts) is what guarantees
  -- source_id actually resolves at creation time. A deleted source row
  -- simply leaves the pack's own already-captured headline/context
  -- intact (it's a snapshot at creation time, not a live join).
  source_type        text        NOT NULL CHECK (source_type IN ('news_candidate', 'event')),
  source_id          uuid        NOT NULL,

  city_name          text,
  headline           text        NOT NULL,
  context            text        NOT NULL,

  facebook_text      text        NOT NULL DEFAULT '',
  instagram_text     text        NOT NULL DEFAULT '',
  tiktok_text        text        NOT NULL DEFAULT '',
  hashtags           text[]      NOT NULL DEFAULT '{}',

  -- The real destination page being promoted, and the three platform-
  -- tagged links built from it (buildSocialShareLink-style UTM tagging —
  -- see src/lib/socialPack.ts). Stored, not just computed on read, so
  -- "a record of the final destination and UTM parameters" survives
  -- even if the destination page's own content later changes.
  destination_url    text        NOT NULL,
  utm_campaign        text        NOT NULL,
  facebook_link       text        NOT NULL DEFAULT '',
  instagram_link      text        NOT NULL DEFAULT '',
  tiktok_link         text        NOT NULL DEFAULT '',

  -- Deterministic inputs for the branded graphic (next/og ImageResponse,
  -- rendered on demand by /admin/social/[id]/image — never a stored
  -- file, never pulled from a third party). Kept as the generation
  -- recipe, not a binary blob, so there's nothing to go stale or need
  -- its own storage bucket.
  image_params        jsonb       NOT NULL DEFAULT '{}',

  status              text        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'ready_for_review', 'approved', 'posted')),

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz,
  -- Set only when an admin manually confirms they've posted it
  -- themselves on the actual platform — never set by any automated code
  -- path in this codebase.
  posted_at            timestamptz,

  -- One pack per source: re-publishing a candidate (the existing
  -- Re-publish action) must never silently spawn a second pack —
  -- creation is an upsert against this constraint (see
  -- findOrCreateSocialPackForSource in src/app/admin/actions.ts).
  CONSTRAINT social_packs_source_key UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS social_packs_status_idx ON public.social_packs (status);
CREATE INDEX IF NOT EXISTS social_packs_city_idx   ON public.social_packs (city_name);

ALTER TABLE public.social_packs ENABLE ROW LEVEL SECURITY;
-- No policies needed: service role (used by every /admin/social server
-- action, via createAdminClient()) bypasses RLS; anon/authenticated
-- roles are denied by default with zero policies defined — same pattern
-- as news_candidates (migration_026) and sync_state/sync_log. A Social
-- Pack is never queried from a public page.
