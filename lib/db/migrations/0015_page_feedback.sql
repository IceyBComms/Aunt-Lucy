-- Feedback button — the organiser's own account of how the page actually went.
--
-- Hand-written and hand-applied (NOT drizzle-kit push, which cannot be trusted
-- with anything that creates a type — the 0001 rename ambiguity). Kate applies
-- to production from the Neon SQL editor; no connection string is ever handed
-- to Claude Code.
--
-- ⚠️ APPLY THIS BEFORE MERGING THE PR. Standing rule, and #022, #023, #033,
-- #048 and #058 are all the same bug: code that reads or writes a thing shipped
-- to Railway before the thing existed, and real users got Postgres 42703 /
-- 42P01 in the middle of a live claim or activation. Here the direction is
-- REQUIRED, not merely prudent: the deployed route INSERTs into this table on
-- the very first submission, and the manage view SELECTs from it on every load.
-- Applying early is free — nothing running today knows the table exists.
--
-- PURELY ADDITIVE: one new table and two indexes. No new enum, no column added
-- to an existing table, no constraint on an existing table, no default, no
-- backfill, no drop, no rename. Nothing already in the schema is touched, and
-- no existing row anywhere is read or written by this migration.
--
-- IDEMPOTENT: every statement guards with IF NOT EXISTS, so a partial re-run —
-- or a run against a branch that already has the table — is a no-op.
--
-- WHY A TABLE AND NOT JUST AN EMAIL
--   The cheaper variant (send to hello@ and store nothing) was considered and
--   rejected while #102 is unexplained. On 2 September a real notification
--   reached nobody — no email, no SMS — on a page whose audience was populated,
--   and the leading candidate is a send that threw and logged nothing. Feedback
--   that vanishes silently is worse than no button at all: the person spent
--   their goodwill, nobody read it, and nobody ever finds out. So the row is
--   the record and the email is only the notification, and the route writes the
--   row FIRST. A failed send costs a notification, never the feedback.
--
-- PRIVACY — read this before writing any query against this table.
--   went_well and got_in_the_way will contain real detail about real illnesses
--   and real deaths, written by people at their lowest. This text goes to Kate
--   and nowhere else. It is NEVER rendered on any page, public or private, and
--   a piece of feedback is NEVER used as a testimonial, on the site or anywhere
--   else, without asking that person first. There is deliberately no drizzle
--   relation from support_pages to this table, so a `with:` on the manage query
--   cannot pull the text out by accident.

BEGIN;

CREATE TABLE IF NOT EXISTS "page_feedback" (
  "id"              text PRIMARY KEY NOT NULL,
  -- Cascade: if the page is gone the feedback has no subject. Unreachable in
  -- practice — only an unclaimed DRAFT can be deleted (see draftDeletion.ts),
  -- and the form is not offered until a task has been claimed.
  "page_id"         text NOT NULL REFERENCES "support_pages"("id") ON DELETE CASCADE,
  -- Which management link it came from. SET NULL, deliberately NOT cascade:
  -- losing the attribution is survivable, losing the words is not.
  "grant_id"        text REFERENCES "page_grants"("id") ON DELETE SET NULL,
  -- Both nullable and both free text. Either one on its own is a valid
  -- submission; the route refuses only when both are empty.
  "went_well"       text,
  "got_in_the_way"  text,
  "created_at"      timestamp NOT NULL DEFAULT now()
);

-- The manage view asks "has this person already left feedback?" on every load,
-- so the thank-you can persist instead of the form reappearing.
CREATE INDEX IF NOT EXISTS "page_feedback_page_id_idx"  ON "page_feedback" ("page_id");
CREATE INDEX IF NOT EXISTS "page_feedback_grant_id_idx" ON "page_feedback" ("grant_id");

COMMIT;

-- Verify after applying — expect exactly these six columns, in this order,
-- with page_id NOT NULL and everything else nullable:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'page_feedback'
--   ORDER BY ordinal_position;
--
-- Expect 0 — the table starts empty and nothing backfills it:
--   SELECT count(*) FROM page_feedback;
--
-- Expect the two foreign keys above and nothing else:
--   SELECT conname, confrelid::regclass AS references, confdeltype
--   FROM pg_constraint WHERE conrelid = 'page_feedback'::regclass AND contype = 'f';
--   -- confdeltype: 'c' (cascade) for support_pages, 'n' (set null) for page_grants.
