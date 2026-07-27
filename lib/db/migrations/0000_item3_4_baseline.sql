-- Item 3 + 4 baseline — the go-live schema for the Item 3 fulfilment + Item 4
-- activate work. This file captures those changes so a database that predates
-- them can be brought up to the same baseline before 0001/0002 are applied.
--
-- ⚠️ CORRECTED 2026-07-26 (comment only — SQL unchanged): an earlier version of
-- this header claimed Item 3 had "shipped to production via drizzle-kit push"
-- and that this file was therefore "a no-op" on prod. Stage 1 of the go-live
-- audit DISPROVED that. A read-only photocopy of real production confirmed prod
-- is still at the PRE-Item-3 baseline — it is missing gifts.deliver_at, the
-- stripe_webhook_events table, support_pages.good_to_know / scheduled_activate_at,
-- and slots.slot_date is still NOT NULL. So on production this file does REAL
-- work and MUST NOT be skipped. (The Item 3 changes only ever reached the
-- rehearsal sandboxes, via drizzle-kit push, which is why the old assumption
-- looked true from the sandbox side.)
--
-- Note also: this file does NOT add the gift_message_type enum values
-- 'gift_delivery' / 'activation_reminder' — prod lacks those too. They are added
-- separately by 0003_enum_catchup.sql, which must be applied alongside this file.
--
-- Named 0000 because it logically precedes 0001. Fully idempotent (IF NOT EXISTS
-- / DROP NOT NULL is a no-op when already nullable), so it is safe to re-run and
-- safe on any DB that already has some of it. Hand-applied; Kate applies to
-- production as part of the go-live runbook.

BEGIN;

-- ── slots.slot_date → nullable ───────────────────────────────────────────────
-- A slot with no date is a flexible offer ("a meal, whenever suits"), dated only
-- when a helper claims it. The nullable column is what makes undated tasks — the
-- common case for someone recovering from birth or a bereavement — possible.
ALTER TABLE "slots" ALTER COLUMN "slot_date" DROP NOT NULL;

-- ── support_pages: good_to_know + scheduled_activate_at ──────────────────────
--   • good_to_know          — optional free-text note shown to every helper.
--   • scheduled_activate_at — set when a recipient activates for a future date;
--                             the page stays draft (invisible) until it passes.
ALTER TABLE "support_pages"
  ADD COLUMN IF NOT EXISTS "good_to_know" text,
  ADD COLUMN IF NOT EXISTS "scheduled_activate_at" timestamp;

-- ── gifts.deliver_at ─────────────────────────────────────────────────────────
-- The buyer's *intended* delivery time (defaults to "now" at purchase). Distinct
-- from delivered_at, which records what actually happened. Null = "as soon as
-- paid".
ALTER TABLE "gifts"
  ADD COLUMN IF NOT EXISTS "deliver_at" timestamp;

-- ── stripe_webhook_events — idempotency ledger ───────────────────────────────
-- Stripe's event id is the PK; a duplicate delivery loses the insert race and
-- the handler treats the unique violation as "already processed".
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "gift_id" text,
  "received_at" timestamp NOT NULL DEFAULT now()
);

COMMIT;
