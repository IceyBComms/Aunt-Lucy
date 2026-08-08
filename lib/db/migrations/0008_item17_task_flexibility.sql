-- Item 17 — "When plans change": task flexibility flag.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process (see the
-- runbook: 0008_item17_task_flexibility.RUNBOOK.md).
--
-- Purely additive: one new enum, one new NOT NULL column on slots with a
-- conservative default, plus a one-off category backfill of existing rows.
-- No drops, no renames, no touch of the gifts/Stripe tables or claim state.
--
-- Idempotent: the enum guards with a catch block, the column guards with
-- IF NOT EXISTS, and the backfill only ever moves rows from the default 'fixed'
-- to 'flexible' by category, so a partial re-run is safe and never regresses a
-- value the page runner may have flipped by hand after the first run.
--
-- What the column is for:
--   • flexibility — is the TIME of this task the helper's to nudge (flexible:
--     meals, grocery runs) or the family's fact (fixed: school pickups, lifts
--     to appointments)? Drives Item 17's helper-side edit rules and the
--     recipient notification channel (fixed → SMS; flexible → email unless the
--     task is today/tomorrow). The page runner can flip it per task; the
--     recipient is never asked to set it.

BEGIN;

-- ── slots.flexibility enum ───────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, so guard it (same pattern as 0007).
DO $$
BEGIN
  CREATE TYPE "slot_flexibility" AS ENUM ('flexible', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ── slots: the flexibility marker ────────────────────────────────────────────
-- NOT NULL with a conservative 'fixed' default: a row inserted by an older code
-- path (or before the per-category default is applied) is never treated as
-- freely reschedulable by accident. The category backfill below then relaxes
-- the rows that are genuinely flexible.
ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "flexibility" "slot_flexibility" NOT NULL DEFAULT 'fixed';

-- ── One-off category backfill of existing rows ───────────────────────────────
-- Mirrors defaultFlexibility() in the API (lib/slotFlexibility.ts). Only ever
-- promotes 'fixed' → 'flexible', so re-running it can't undo a manual flip:
--   • meals, grocery runs, dog walks              → flexible
--   • errands WITHOUT a fixed date (laundry etc.) → flexible
--   • errands WITH a date (a lift to an appt),
--     school & kinder pickups, child care,
--     visits, and anything custom/unknown         → stay 'fixed'
-- (A dated errand is treated as a lift/appointment — the conservative reading of
-- the one category the brief lists under both "flexible" and "fixed".)
UPDATE "slots"
SET "flexibility" = 'flexible'
WHERE "flexibility" = 'fixed'
  AND (
    "slot_type" IN ('meal', 'shopping', 'dog_walking')
    OR ("slot_type" = 'errand' AND "slot_date" IS NULL)
  );

COMMIT;
