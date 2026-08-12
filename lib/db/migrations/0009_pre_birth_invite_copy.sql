-- Pre-birth invite copy — trusted_line override + baby_stage.
--
-- Hand-written and NOT YET APPLIED. Kate applies to production via the normal
-- PR/merge process, backup-first (NOT drizzle-kit push — the enum rename
-- ambiguity that bit 0001 applies here too, so run this SQL by hand).
--
-- Purely additive: one new enum, two new NULLABLE columns on support_pages. No
-- defaults, no drops, no renames, no backfill, no touch of the gifts/Stripe
-- tables or any claim state.
--
-- Idempotent: the enum guards with a catch block and each column guards with
-- IF NOT EXISTS, so a partial re-run is safe.
--
-- What these are for:
--   • trusted_line — the trusted "support circle" (9b) counterpart to the
--     existing situation_line. Until now the trusted invite line had no stored
--     override at all — it was always the occasion default. This gives it the
--     same edit-or-fall-back-to-default shape situation_line already has:
--     resolved as `page.trustedLine ?? defaultTrustedLine(occasion, babyStage)`
--     at send time. NULL means "use the default".
--   • baby_stage  — new_baby pages only: 'expecting' | 'arrived', or NULL when
--     not asked. Pre-birth gifting (baby showers) is a marketed use case, but
--     the new_baby copy previously always assumed the baby had arrived. This
--     lets the invite + situation/trusted lines read true either side of the
--     birth, and (because it's stored, not baked into the line) can be flipped
--     later via /manage so invites sent after the birth update themselves.
--     NULL and every non-new_baby occasion fall back to a stage-agnostic
--     default, so nothing is ever assumed.

BEGIN;

-- ── support_pages.baby_stage enum ────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, so guard it (same pattern as 0007/0008).
DO $$
BEGIN
  CREATE TYPE "baby_stage" AS ENUM ('expecting', 'arrived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ── support_pages: the two new columns ───────────────────────────────────────
-- Both nullable with NO default: existing rows read NULL and fall back to the
-- occasion default at send time, exactly as they do today. Nothing existing is
-- touched. This keeps the paid redemption path byte-for-byte unchanged.
ALTER TABLE "support_pages"
  ADD COLUMN IF NOT EXISTS "trusted_line" text,
  ADD COLUMN IF NOT EXISTS "baby_stage" "baby_stage";

COMMIT;
