-- Social Pack multi-city posts (3 Oct 2026).
--
-- 1. Allows one Social Pack per (source, city) instead of one per
--    source. A multi-city-targeted news story needs a separate pack per
--    city ("Create city posts"), but the original constraint only ever
--    allowed a single row per (source_type, source_id) — a second city
--    for the same candidate would have collided with (and silently
--    no-op'd against, via ignoreDuplicates) the first one. Widening the
--    key to include city_name is what makes "one separate Social Pack
--    per city" and "prevent duplicate packs if the action is clicked
--    twice" both true at once: the same idempotent upsert pattern
--    already used for the single-pack case now dedupes per city instead
--    of per source.
ALTER TABLE public.social_packs DROP CONSTRAINT IF EXISTS social_packs_source_key;
ALTER TABLE public.social_packs ADD CONSTRAINT social_packs_source_city_key UNIQUE (source_type, source_id, city_name);

-- 2. Adds a 'skipped' status alongside the existing linear
--    draft -> ready_for_review -> approved -> posted progression, so an
--    admin reviewing a batch of per-city packs can explicitly skip one
--    (e.g. a city whose venue/date couldn't be verified, or one they've
--    decided not to post) without deleting it — it stays editable and
--    can be unskipped back to draft. canAdvanceSocialPackStatus's
--    forward/backward linear logic deliberately does not cover
--    'skipped' at all (see socialPack.ts) — it's a separate, orthogonal
--    action, not a fifth rung on that ladder.
ALTER TABLE public.social_packs DROP CONSTRAINT IF EXISTS social_packs_status_check;
ALTER TABLE public.social_packs ADD CONSTRAINT social_packs_status_check
  CHECK (status IN ('draft', 'ready_for_review', 'approved', 'posted', 'skipped'));
