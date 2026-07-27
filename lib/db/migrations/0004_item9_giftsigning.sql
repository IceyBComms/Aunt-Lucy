-- Item 9 — workplace team card: colleagues sign, organiser reviews + seals.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: one new enum, one new column-set on gift_signings, three new
-- nullable columns on gifts. No drops, no destructive backfill.
--
-- Idempotent: every statement guards with IF NOT EXISTS / a catch block, so a
-- partial re-run is safe.

BEGIN;

-- ── gift_signings status enum ────────────────────────────────────────────────
-- A note's lifecycle: visible by default; the organiser's soft-remove flips it
-- to removed. CREATE TYPE has no IF NOT EXISTS, so guard it.
DO $$
BEGIN
  CREATE TYPE "gift_signing_status" AS ENUM ('visible', 'removed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ── gift_signings: soft-remove support ───────────────────────────────────────
--   • status      — visible | removed. Existing rows (there are none in prod,
--                   but belt-and-braces) default to visible, the safe state.
--   • removed_at  — audit stamp for a soft-remove; null while visible.
ALTER TABLE "gift_signings"
  ADD COLUMN IF NOT EXISTS "status" "gift_signing_status" NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS "removed_at" timestamp;

-- ── gifts: the workplace team-card tokens + seal marker ───────────────────────
--   • signing_token   — public "sign the card" link, shared with the whole team.
--   • organiser_token — the buyer's private review/remove/seal link.
--   • card_sealed_at  — set when the organiser sends the card; delivery of a
--                       card gift is gated on this.
-- All nullable: a plain consumer gift carries none of them.
ALTER TABLE "gifts"
  ADD COLUMN IF NOT EXISTS "signing_token" text,
  ADD COLUMN IF NOT EXISTS "organiser_token" text,
  ADD COLUMN IF NOT EXISTS "card_sealed_at" timestamp,
  -- The signing team's organisation ("everyone at {org}"). Set by the organiser
  -- on their review page, not captured at purchase, so nullable with a graceful
  -- copy fallback when absent.
  ADD COLUMN IF NOT EXISTS "organisation_name" text;

-- Unguessable tokens are the only credential on these links, so uniqueness is a
-- correctness guarantee, not just an index. Partial-free unique indexes treat
-- multiple NULLs as distinct in Postgres, so every consumer gift (both tokens
-- null) coexists happily.
CREATE UNIQUE INDEX IF NOT EXISTS "gifts_signing_token_key"
  ON "gifts" ("signing_token");
CREATE UNIQUE INDEX IF NOT EXISTS "gifts_organiser_token_key"
  ON "gifts" ("organiser_token");

COMMIT;
