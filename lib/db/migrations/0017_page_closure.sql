-- 0017 — page closure (bug #090): record WHEN a page was closed.
--
-- PURELY ADDITIVE. One nullable timestamp, no backfill, no default, no data
-- touched. IF NOT EXISTS, so it is safe to re-run and safe on a database that
-- already has the column.
--
-- ⚠️ APPLY FIRST, MERGE SECOND. #022, #023, #033, #048 and #058 were all the
-- other order. Kate applies this by hand in the Neon SQL editor, then merges
-- the PR.
--
-- ── WHY THIS MAY ALREADY BE A NO-OP ON PRODUCTION ───────────────────────────
-- `closed_at` has been DECLARED in the Drizzle schema (lib/db/src/schema/
-- supportPages.ts) since the original Replit-era commit c04700d, and has never
-- appeared in any migration file — support_pages predates the migration series
-- and was created by drizzle-kit push. Since every read of a page selects that
-- column by name, a production database lacking it would 500 on every page
-- load, and production works. So the column is almost certainly already there
-- and this statement will report "already exists" and change nothing.
--
-- It is written anyway, for two reasons. A sandbox built from these migration
-- files alone does NOT have the column, and this is the only file that would
-- give it one. And a column that exists by accident, recorded nowhere, is a
-- column the next person cannot trust.
--
-- ── WHY THE DATE IS RECORDED NOW ─────────────────────────────────────────────
-- Kate's lawyer has advised that personal information must not be kept once it
-- is no longer needed. Every retention rule will be phrased "X after closure",
-- and a date that was never written cannot be backfilled — the moment it refers
-- to has gone. Nothing in the retention work exists yet; this is the one part
-- of it that cannot be added later.

BEGIN;

ALTER TABLE "support_pages" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;

COMMIT;
