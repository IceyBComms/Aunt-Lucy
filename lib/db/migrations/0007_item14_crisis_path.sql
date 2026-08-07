-- Item 14 — free self-serve crisis path.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: one new enum, one new nullable column on support_pages.
-- No drops, no destructive backfill, no touch of the gifts/Stripe tables.
--
-- Idempotent: every statement guards with IF NOT EXISTS / a catch block, so a
-- partial re-run is safe.

BEGIN;

-- ── support_pages.origin enum ────────────────────────────────────────────────
-- Where a support page came from, so crisis-free pages can be counted and
-- reported separately from paid and VIP-comp pages later.
--   • crisis_free — the new free self-serve crisis path (this item).
--   • organiser   — a page an organiser built directly via the setup wizard.
--   • gift        — a page redeemed from a purchased gift (paid OR $0 VIP-comp;
--                   paid-vs-comp is a property of the linked gift row, not the
--                   page). Reserved for future use — the gift redemption path is
--                   deliberately left untouched by this item, so existing and
--                   new gift-redeemed pages keep origin NULL for now.
-- CREATE TYPE has no IF NOT EXISTS, so guard it.
DO $$
BEGIN
  CREATE TYPE "page_origin" AS ENUM ('crisis_free', 'organiser', 'gift');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ── support_pages: the origin marker ─────────────────────────────────────────
-- Nullable with NO default on purpose: existing rows (a mix of gift-redeemed and
-- organiser-created pages we can't cleanly reclassify) stay NULL rather than
-- being mislabelled by a blanket backfill. Going forward the crisis path writes
-- 'crisis_free' and the organiser wizard writes 'organiser'; NULL therefore
-- reads as "legacy or gift-redeemed". This keeps the paid redemption path
-- byte-for-byte unchanged — it never writes this column.
ALTER TABLE "support_pages"
  ADD COLUMN IF NOT EXISTS "origin" "page_origin";

COMMIT;
