-- Item 7 + 8 — name visibility at claim + recipient claim notifications.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: new nullable columns and one boolean with a safe default.
-- No drops, no backfill needed — existing claimed slots simply have a null
-- claimed_at (they predate the column) and stay hidden-by-default, which is the
-- correct, privacy-preserving behaviour.
--
-- Idempotent: every statement uses IF NOT EXISTS, so a partial re-run is safe.

BEGIN;

-- ── support_pages: where to reach the recipient ──────────────────────────────
-- Captured at activation (prefilled from the gift when we have it, asked for
-- when we don't) and editable later via /manage. This is what makes the Item 8
-- notifications deliverable. The legacy, unused "recipient_contact" column is
-- left untouched; these two typed columns supersede it.
--   • recipient_email  — the notification channel used now.
--   • recipient_mobile — captured optionally, for SMS once that path is wired.
ALTER TABLE "support_pages"
  ADD COLUMN IF NOT EXISTS "recipient_email" text,
  ADD COLUMN IF NOT EXISTS "recipient_mobile" text;

-- ── slots: name-visibility + the notification bookkeeping ────────────────────
--   • claimed_at            — when the slot was claimed. Needed to batch new,
--                             un-notified claims and to show "when" on /manage.
--                             Null for pre-existing claims (predate this column).
--   • claimed_name_visible  — the helper's opt-in choice at claim time. Default
--                             FALSE: a name is shown on the public /s/ page only
--                             if the helper ticked "show my name". The recipient
--                             always sees the name on /manage regardless — that
--                             read is not gated by this flag.
--   • recipient_notified_at — set by the claim-notification dispatcher once a
--                             claim has been included in a batch to the
--                             recipient, so it is never notified twice.
ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "claimed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "claimed_name_visible" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recipient_notified_at" timestamp;

-- Backfill: any slot already claimed before this feature existed is stamped as
-- already-notified, so the dispatcher can never send a notification for a claim
-- that happened in the past. The "don't retroactively notify" guarantee thus
-- lives in the data, not in query logic. The now() here is a watermark meaning
-- "predates claim notifications" — it is NOT a real send time. Idempotent: the
-- IS NULL guard means a re-run won't overwrite genuine notification stamps.
UPDATE "slots"
  SET "recipient_notified_at" = now()
  WHERE "is_claimed" = true AND "recipient_notified_at" IS NULL;

-- The dispatcher looks for claimed slots with recipient_notified_at IS NULL.
-- A partial index over just those keeps that sweep cheap as the table grows.
CREATE INDEX IF NOT EXISTS "slots_pending_notification_idx"
  ON "slots" ("page_id")
  WHERE "is_claimed" = true AND "recipient_notified_at" IS NULL;

COMMIT;
