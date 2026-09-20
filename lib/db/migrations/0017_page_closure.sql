-- 0017 — page closure (bug #090): record WHEN a page was closed, and WHAT IT WAS.
--
-- PURELY ADDITIVE. Two nullable columns, no backfill, no defaults, no data
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

-- ── status_before_close ──────────────────────────────────────────────────────
-- What the page WAS when it was closed, so reopening puts it back rather than
-- publishing it.
--
-- ⚠️ THIS IS WHY IT CANNOT WAIT. Closing a page that is not yet live is
-- legitimate and is one of the cases closure exists for — a scheduled gift page
-- whose recipient has died. But reopening one to 'active' would publish a
-- half-built page that nobody ever chose to make live. Without this column the
-- only safe reopen is a guess, and the moment pages have been closed without it
-- the record of what they should return to is GONE and cannot be backfilled.
-- Same argument as closed_at above, for the same reason it is in the same file.
--
-- Nullable with no default and no backfill. NULL means "closed before this
-- shipped" and the code falls back to 'active' — see restoredStatus() in
-- api-server/src/lib/pageClosure.ts. Plain text rather than the page_status
-- enum on purpose: it is a RECORD of a past value, not a live status, so it
-- must never take part in a status query and must survive the enum gaining or
-- losing a value (ALTER TYPE ... ADD VALUE is the shape that needed the 0003
-- catch-up).
ALTER TABLE "support_pages" ADD COLUMN IF NOT EXISTS "status_before_close" text;

COMMIT;
