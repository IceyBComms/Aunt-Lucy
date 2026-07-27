-- Item 3 catch-up — gift_message_type enum values.
--
-- REVIEW-ONLY DRAFT. Not applied anywhere. Hand-applied to production by Kate
-- as part of the Item 3 catch-up, ALONGSIDE 0000 and BEFORE 0001a — see the
-- go-live runbook. The filename number (0003) is later than 0001/0002 but its
-- APPLY ORDER is early: it must run before any code path inserts these values.
--
-- WHY THIS FILE EXISTS
-- The values 'gift_delivery' and 'activation_reminder' are declared in the
-- Drizzle schema (lib/db/src/schema/giftMessages.ts) and were added to the
-- rehearsal sandboxes by `drizzle-kit push` during the original Item 3
-- rehearsal. They were NEVER captured in a hand-written migration, and prod was
-- verified (2026-07-26, read-only photocopy) to be MISSING both — its
-- gift_message_type enum has only: thank_you, helper_reminder, gifted_by,
-- welcome, custom. main's already-deployed giftFulfilment.ts inserts
-- type:'gift_delivery' on every paid gift, so without this the first real
-- purchase fails with "invalid input value for enum gift_message_type".
--
-- NO TRANSACTION WRAPPER — DELIBERATE.
-- ALTER TYPE ... ADD VALUE must not be followed by USE of that value in the
-- same transaction (Postgres restriction). Keeping this file free of BEGIN/
-- COMMIT lets each ADD VALUE auto-commit on its own, which is the safest form
-- across Postgres versions. Do not wrap these in a transaction.
--
-- IDEMPOTENT: ADD VALUE IF NOT EXISTS is a no-op if the value already exists,
-- so a re-run (or running against an already-migrated DB) is safe.

ALTER TYPE "gift_message_type" ADD VALUE IF NOT EXISTS 'gift_delivery';
ALTER TYPE "gift_message_type" ADD VALUE IF NOT EXISTS 'activation_reminder';

-- Verify after applying (expect 7 rows, including the two above):
--   SELECT e.enumlabel
--   FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
--   WHERE t.typname = 'gift_message_type'
--   ORDER BY e.enumsortorder;
