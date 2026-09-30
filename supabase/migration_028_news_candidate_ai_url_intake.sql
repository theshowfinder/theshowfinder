-- migration_028_news_candidate_ai_url_intake.sql
-- "News Intelligence Inbox" Phase 3 — AI-assisted URL intake. An admin
-- pastes a trusted article URL; the server fetches it (SSRF-guarded, see
-- src/lib/urlIntake.ts), extracts basic metadata, and -- if ANTHROPIC_API_KEY
-- is configured -- asks Claude to suggest editorial fields as structured
-- JSON (see src/lib/newsAiSuggestions.ts). The result is inserted as a
-- normal news_candidates row, always 'pending', using the exact same
-- editorial columns Phase 1/2's manual form already edits -- so approve/
-- publish/unpublish/republish, duplicate protection and multi-city
-- targeting all keep working completely unchanged. What's genuinely new
-- here is provenance-tracking (was this row typed by hand or imported from
-- a URL?) and a place to keep the raw extracted content + raw AI output
-- for admin review, kept deliberately separate from the real editorial
-- columns so nothing AI-suggested is ever silently treated as final.
--
-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query -> Run
-- (as with every other migration in this repo -- no CLI-linked workflow).

-- intake_method: distinguishes how a candidate was created. Every existing
-- row (Phase 1/2) gets 'manual' via the column default -- this migration
-- makes no claim about how those were actually entered beyond "not this
-- new URL-import flow", which is true by construction (it didn't exist
-- yet).
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS intake_method text NOT NULL DEFAULT 'manual'
  CHECK (intake_method IN ('manual', 'url_import'));

-- extracted_content: the raw, unedited result of fetching + parsing the
-- article page -- title, meta description, JSON-LD/og headline, source
-- domain, publication date, best-effort main article text, and the final
-- (post-redirect) URL. Never written to after creation; this is the
-- factual record of what the page actually said, kept separate from
-- whatever the admin later edits into the real headline/summary/etc.
-- columns.
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS extracted_content jsonb;

-- ai_suggestions: Claude's raw structured suggestion (headline, summary,
-- scope, cities, category, priority, suggested publish date, confidence/
-- uncertainty notes, a social caption and an email teaser -- see
-- src/lib/newsAiSuggestions.ts for the exact shape and its validation/
-- sanitization). Shown to the admin for reference on the review screen;
-- never itself published or auto-copied anywhere -- the admin's edits to
-- the real editorial columns are what get saved and, eventually,
-- published.
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS ai_suggestions jsonb;

-- ai_model: which model produced ai_suggestions (e.g.
-- 'claude-haiku-4-5-...'), for auditability if the model is ever changed.
-- Null when no AI suggestion was generated (URL import with no API key
-- configured, or the AI call failed/timed out -- the candidate is still
-- created from the extracted content alone in that case).
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS ai_model text;

ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;

-- ai_review_status: has an admin actually looked at the AI suggestion?
-- Separate from review_status (which tracks the pending/approved/
-- rejected/published editorial workflow) because a candidate can be
-- 'approved' or even 'published' by an admin who never looked at what the
-- AI suggested (they may have typed completely different values over it).
--   not_applicable -- no AI suggestion exists for this candidate (every
--                    Phase 1/2 manual candidate; also a URL-import where
--                    the AI call was skipped/failed)
--   unreviewed      -- a suggestion was generated and the admin has not
--                    yet saved the candidate since
--   reviewed        -- the admin has saved the candidate at least once
--                    since the suggestion was generated (updateNewsCandidateAction
--                    flips this automatically -- see src/app/admin/actions.ts)
ALTER TABLE public.news_candidates ADD COLUMN IF NOT EXISTS ai_review_status text NOT NULL DEFAULT 'not_applicable'
  CHECK (ai_review_status IN ('not_applicable', 'unreviewed', 'reviewed'));
