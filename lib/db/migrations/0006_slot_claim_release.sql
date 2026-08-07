-- Slot claim release / un-claim — a helper who claimed a slot can hand it back.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: four new nullable columns on slots plus a unique index on the
-- new token. No new enums, no drops, no renames, no destructive backfill. Every
-- existing claimed slot keeps working — its cancel_token is simply NULL, which
-- means "no live release link" (only claims made after this ships get one).
--
-- Idempotent: every ADD COLUMN and the index guard with IF NOT EXISTS, so a
-- partial re-run (or a re-run against a branch that already has a column) is safe.
--
-- What the columns are for:
--   • cancel_token            — the helper's private release handle, minted at
--                               claim time and put in the confirmation email.
--                               Unique; NULL when the slot is unclaimed.
--   • claim_cancelled_at      — audit: when the last claim was released.
--   • cancelled_claim_name    — audit snapshot of who released (the live
--   • cancelled_claim_contact   claimed_by_* columns are cleared on release so
--                               the freed slot can't leak the old name).
-- Together the three audit columns are the "record it happened, not a full
-- wipe" that mirrors the gift_signings soft-remove pattern.

BEGIN;

ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "cancel_token" text,
  ADD COLUMN IF NOT EXISTS "claim_cancelled_at" timestamp,
  ADD COLUMN IF NOT EXISTS "cancelled_claim_name" text,
  ADD COLUMN IF NOT EXISTS "cancelled_claim_contact" text;

-- Unique like helper_invites.invite_token. Postgres allows many NULLs in a
-- unique index, so every unclaimed slot (cancel_token IS NULL) coexists freely;
-- only live tokens are constrained to be distinct.
CREATE UNIQUE INDEX IF NOT EXISTS "slots_cancel_token_unique"
  ON "slots" ("cancel_token");

COMMIT;
