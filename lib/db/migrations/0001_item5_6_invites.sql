-- Item 5 + 6 — contact gathering + the Aunt Lucy invite/trickle.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), because it drops
-- trusted_helper_invites. Production was confirmed empty (0 rows) before this
-- was written; this migration is applied to the SANDBOX branch only. Kate
-- applies to production via the normal PR/merge process.
--
-- Idempotent-ish: uses IF NOT EXISTS / IF EXISTS so a partial re-run is safe.

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

-- ── Drop the superseded table (confirmed empty in production) ─────────────────
DROP TABLE IF EXISTS "trusted_helper_invites";

COMMIT;
