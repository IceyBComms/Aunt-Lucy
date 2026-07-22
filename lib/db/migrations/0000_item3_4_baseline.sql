-- Item 3 + 4 baseline — the go-live schema that shipped to production via
-- drizzle-kit push BEFORE numbered migrations existed. This file captures those
-- changes so a freshly-branched database (which inherits an older snapshot) can
-- be brought up to the same baseline before 0001/0002 are applied.
--
-- Named 0000 because it logically precedes 0001, though on an existing sandbox
-- it is simply applied whenever. Fully idempotent (IF NOT EXISTS / DROP NOT NULL
-- is a no-op when already nullable), and safe to run against production, where
-- every statement is already satisfied and does nothing.
--
-- Hand-applied to the sandbox; Kate applies to production via the normal
-- PR/merge process (a no-op there, since prod already has all of this).

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
