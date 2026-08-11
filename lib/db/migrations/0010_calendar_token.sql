-- Calendar feed per claim — a subscribable .ics feed for a claimed slot.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: one new nullable column on slots plus a unique index on the
-- new token. No new enums, no drops, no renames, no destructive backfill. Every
-- existing claimed slot keeps working — its calendar_token is simply NULL, which
-- means "no calendar feed" (only claims made after this ships get one). The
-- exact shape as 0006's cancel_token, its sibling.
--
-- Idempotent: the ADD COLUMN and the index guard with IF NOT EXISTS, so a
-- partial re-run (or a re-run against a branch that already has the column) is
-- safe.
--
-- What the column is for:
--   • calendar_token — the helper's private handle to GET /api/calendar/:token
--                      .ics, minted at claim time alongside cancel_token and put
--                      in the confirmation email as "Add to your calendar".
--                      Unique; NULL when the slot is unclaimed. Unlike
--                      cancel_token it is NOT nulled on release: the feed must
--                      survive so a subscribed calendar can be told
--                      STATUS:CANCELLED instead of silently 404-ing. Rotated on
--                      re-claim (a fresh mint overwrites), so a released helper's
--                      feed stays cancelled and never resurfaces another helper's
--                      later booking.

BEGIN;

ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "calendar_token" text;

-- Unique like cancel_token. Postgres allows many NULLs in a unique index, so
-- every unclaimed slot (calendar_token IS NULL) coexists freely; only live
-- tokens are constrained to be distinct.
CREATE UNIQUE INDEX IF NOT EXISTS "slots_calendar_token_unique"
  ON "slots" ("calendar_token");

COMMIT;
