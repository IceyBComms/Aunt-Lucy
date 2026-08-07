-- Bugs #005 + #006 — richer task details a helper needs before claiming.
--
-- Hand-written and hand-applied (NOT drizzle-kit push), to the SANDBOX branch
-- only. Kate applies to production via the normal PR/merge process.
--
-- Purely additive: two new nullable columns on slots. No new enums, no drops,
-- no renames, no destructive backfill.
--
-- Idempotent: every ADD COLUMN guards with IF NOT EXISTS, so a partial re-run
-- (or a re-run against a branch that already has one column) is safe.
--
-- Scope note:
--   • #006 (meals) — the two columns below: dietary_notes + headcount. These
--     did not exist anywhere; a helper cooking a meal was flying blind.
--   • #005 (school-pickup time) — NO schema change. The generic, nullable
--     slots.slot_time column already exists and is displayed to helpers
--     end-to-end; the fix for #005 is UI-only (surfacing/capturing that time in
--     the gift-activation review flow, which never had a time input), so it
--     needs no migration. See the PR description.

BEGIN;

-- ── slots: meal detail fields (bug #006) ─────────────────────────────────────
--   • dietary_notes — free text (allergies, "vegetarian household", etc.).
--   • headcount     — how many people the meal needs to feed.
-- Both nullable and meal-only: every existing row, and every non-meal slot,
-- keeps NULL. Nothing existing is touched.
ALTER TABLE "slots"
  ADD COLUMN IF NOT EXISTS "dietary_notes" text,
  ADD COLUMN IF NOT EXISTS "headcount" integer;

COMMIT;
