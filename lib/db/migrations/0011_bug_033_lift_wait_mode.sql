-- Bug #033 — does the helper wait, or just drop off?
--
-- Hand-written and hand-applied (NOT drizzle-kit push). See the runbook:
-- 0011_bug_033_lift_wait_mode.RUNBOOK.md.
--
-- ⚠️ APPLY THIS BEFORE MERGING THE PR, not after. Bugs #022 and #023 were both
-- merged-but-unapplied migrations that threw 42703 undefined_column at real
-- users. The column is nullable with no default, so production can carry it
-- safely with nothing reading it.
--
-- Purely additive: one new enum, one new NULLABLE column on slots. No default,
-- no backfill, no drops, no renames, no touch of gifts/Stripe/claim state.
--
-- Idempotent: the enum guards with a catch block (same pattern as 0007/0008/
-- 0009) and the column guards with IF NOT EXISTS, so a partial re-run is safe.
--
-- What the column is for:
--   • lift_wait_mode — for a lift, the single fact a helper needs before they
--     say yes: are they dropping someone off, waiting and bringing them home,
--     or collecting them? "Drop off" is a twenty-minute favour; "wait" can be
--     half a day. Nothing in the product said which, so a helper could claim a
--     task expecting the first and lose an afternoon to the second.
--
-- Why this column rather than a new slot_type:
--   There is no 'lift' slot type. A lift is modelled as a DATED errand (see
--   occasionSuggestions.ts and the dated-errand reading in slotFlexibility.ts).
--   Adding 'lift' to the slot_type enum would mean an ALTER TYPE ... ADD VALUE
--   — the failure shape that needed the 0003 enum catch-up — plus a new case in
--   every switch on slotType across the API and frontend. Instead the presence
--   of this column IS the marker for "this task is a lift".
--
-- ⚠️ NULL IS MEANINGFUL, AND IT IS EVERY EXISTING ROW.
--   NULL means "not a lift, or nobody has said yet", and every surface renders
--   NOTHING for it: no control on the tile, no clause in the confirmation email
--   or SMS, and the unchanged default calendar duration. A dated "pick up a
--   prescription" errand is a NULL row and must look exactly as it does today —
--   a wait-or-not question on a prescription is nonsense. This is enforced in
--   the application layer (liftWaitMode.ts returns null for an unset mode, and
--   every caller renders conditionally), NOT by a database constraint.

BEGIN;

-- ── lift_wait_mode enum ──────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, so guard it (same pattern as 0007/0008).
-- The VALUES are stable and semantic; the words a helper actually reads live in
-- artifacts/api-server/src/lib/liftWaitMode.ts and can be reworded without any
-- migration. Nothing keys off the display labels.
DO $$
BEGIN
  CREATE TYPE "lift_wait_mode" AS ENUM ('drop_off', 'wait', 'pick_up');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ── slots: the wait-or-not answer ────────────────────────────────────────────
-- NULLABLE with NO DEFAULT, deliberately. A default would silently mark every
-- existing errand as a lift and start asking helpers a question about their
-- prescription pickup. Absence has to stay expressible.
ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "lift_wait_mode" "lift_wait_mode";

COMMIT;
