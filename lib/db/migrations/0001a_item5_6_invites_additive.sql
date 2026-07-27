-- Item 5 + 6 — contact gathering + the Aunt Lucy invite/trickle (ADDITIVE HALF).
--
-- REVIEW-ONLY DRAFT. Not applied anywhere. This is the split-out ADDITIVE half
-- of the original 0001_item5_6_invites.sql. The destructive DROP TABLE has been
-- moved to its sibling 0001b_item5_6_drop_legacy.sql so it can be sequenced
-- AFTER the new code deploys.
--
-- WHY SPLIT
-- Prod's currently-deployed code (main) has a LIVE mounted route (invitesRouter)
-- that reads and writes trusted_helper_invites. If the DROP ran while that code
-- was still serving, an invite request would hit a dropped table and 500. So:
--   Phase B (this file) — apply the additive create statements. Old code keeps
--                         running fine; the new tables simply sit unused.
--   Phase C — deploy the new code (which uses helper_invites, not the old table).
--   Phase C — THEN run 0001b (the DROP). See the go-live runbook.
--
-- Statements below are byte-for-byte the additive statements from the original
-- 0001 (only the final DROP is removed), so they match exactly what was
-- rehearsed on the ep-flat-block sandbox. Prod dependency check (2026-07-26
-- read-only photocopy): gift_occasion enum exists; support_pages, slots exist;
-- the five enums and three tables below are all absent — so every CREATE runs
-- clean.
--
-- Apply ORDER within the Item 3+ catch-up: 0000  →  0003 (enum)  →  0001a (this)
--                                          →  0002.
--
-- APPLY-ONCE: the CREATE TABLE / ADD COLUMN / CREATE INDEX statements are all
-- IF NOT EXISTS and thus re-runnable, but the five CREATE TYPE statements are
-- NOT (Postgres has no CREATE TYPE IF NOT EXISTS) — a second run errors on the
-- first enum. Treat this file as apply-once. It is still fully atomic: the
-- BEGIN/COMMIT means a failure part-way rolls the whole thing back, leaving
-- nothing half-created to clean up before retrying.

BEGIN;

-- ── New enums ────────────────────────────────────────────────────────────────
-- gift_occasion already exists (created with the gifts table); it is now also
-- used by support_pages.occasion, so nothing to create for it here.

CREATE TYPE "recipient_pronouns" AS ENUM ('she_her', 'he_him', 'they_them');
CREATE TYPE "page_grant_role" AS ENUM ('recipient', 'manager');
CREATE TYPE "helper_invite_kind" AS ENUM ('general', 'trusted', 'second_wave');
CREATE TYPE "helper_invite_channel" AS ENUM ('sms', 'email');
CREATE TYPE "helper_invite_status" AS ENUM ('queued', 'sent', 'failed', 'cancelled');

-- ── support_pages: pronoun + occasion + situation line ───────────────────────
ALTER TABLE "support_pages"
  ADD COLUMN IF NOT EXISTS "occasion" "gift_occasion",
  ADD COLUMN IF NOT EXISTS "recipient_pronouns" "recipient_pronouns" NOT NULL DEFAULT 'they_them',
  ADD COLUMN IF NOT EXISTS "situation_line" text;

-- ── contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL REFERENCES "support_pages"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "mobile" text,
  "email" text,
  "trusted" boolean NOT NULL DEFAULT false,
  "opted_out_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "contacts_page_id_idx" ON "contacts" ("page_id");

-- ── page_grants (management tokens) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "page_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL REFERENCES "support_pages"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "role" "page_grant_role" NOT NULL DEFAULT 'recipient',
  "person_name" text,
  "person_contact" text,
  "granted_by_grant_id" text,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "page_grants_page_id_idx" ON "page_grants" ("page_id");

-- ── helper_invites (supersedes trusted_helper_invites; also the send outbox) ──
CREATE TABLE IF NOT EXISTS "helper_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL REFERENCES "support_pages"("id") ON DELETE cascade,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE set null,
  "slot_id" text REFERENCES "slots"("id") ON DELETE cascade,
  "kind" "helper_invite_kind" NOT NULL,
  "channel" "helper_invite_channel" NOT NULL,
  "name" text NOT NULL,
  "mobile" text,
  "email" text,
  "personal_opening_line" text,
  "invite_token" text UNIQUE,
  "status" "helper_invite_status" NOT NULL DEFAULT 'queued',
  "scheduled_for" timestamp NOT NULL,
  "sent_at" timestamp,
  "failed_at" timestamp,
  "claimed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "helper_invites_page_id_idx" ON "helper_invites" ("page_id");
CREATE INDEX IF NOT EXISTS "helper_invites_slot_id_idx" ON "helper_invites" ("slot_id");
-- The dispatcher claims by (status, scheduled_for); index the hot path.
CREATE INDEX IF NOT EXISTS "helper_invites_dispatch_idx" ON "helper_invites" ("status", "scheduled_for");

-- NOTE: the DROP TABLE "trusted_helper_invites" that was here in the original
-- 0001 has been moved to 0001b_item5_6_drop_legacy.sql — run it in Phase C,
-- after the new code is deployed.

COMMIT;
