# Prod migration runbook — 0009_pre_birth_invite_copy

Backup-first, verify-first. Follows the house ITEM9 / 0007 / 0008 pattern:
hand-applied SQL, never `drizzle-kit push` (the enum-rename ambiguity that bit
0001 applies to any migration that creates a type). **Purely additive** — one
enum, two NULLABLE columns, no default, no backfill, no drop.

**Status: APPLIED to production 2026-08-12** (safety branch `pre-0009-safety`).
Kept as the record of what ran and how to re-run it against any fresh copy.

## Why this needed its own runbook

Unlike 0008 (applied *before* its app code shipped), the PR #54 application code
was already live on Railway/Vercel when this migration was still outstanding. The
activation handler (`POST /api/gifts/:redemptionToken/activate`) writes
`support_pages.trusted_line` and `support_pages.baby_stage` on **every**
activation — so with the columns missing, the `INSERT` threw Postgres `42703
undefined_column`, surfaced as a generic 500 ("Something went wrong.") and the
frontend's "That didn't go through. Have another go in a moment." Applying this
migration is what cleared it. There is no deploy-sequencing step: the code that
depends on these columns is already deployed.

## What it does

- Creates enum `baby_stage` = `('expecting', 'arrived')` (guarded `DO` block, so
  a partial re-run is a no-op).
- Adds `support_pages.trusted_line` — `text`, **nullable, no default**. The
  trusted-circle counterpart to `situation_line`; NULL means "use the occasion
  default", resolved at send time as
  `page.trustedLine ?? defaultTrustedLine(occasion, babyStage)`.
- Adds `support_pages.baby_stage` — `baby_stage`, **nullable, no default**.
  new_baby pages only; NULL and every non-new_baby occasion fall back to a
  stage-agnostic default, so nothing is ever assumed. Stored (not baked into the
  line) so a later /manage flip updates invites sent from then on.

Existing rows read NULL for both and are otherwise untouched — the paid
redemption path is byte-for-byte unchanged.

## Order of operations

Because both columns are nullable with no default and there is no backfill, the
migration is safe to run at any time relative to the app deploy. In practice the
app was already live, so the order was simply:

1. Take the backup (below).
2. Run the pre-checks (which also confirm the missing-migration diagnosis).
3. Apply `0009_pre_birth_invite_copy.sql`.
4. Run the verify queries.
5. Re-test activation ("Make it live"). No redeploy required.

No post-deploy step — there is nothing to drop.

## 1. Back up first

On Neon, create a branch/copy of production **before** applying, exactly as ITEM9
used `ep-blue-block` and Item 17 used `ep-item17-pre-0008`:

```
# Neon console → Branches → New branch from `production` (name e.g. pre-0009-safety)
```

Keep that branch until activation has been verified in prod for a few days.

## 2. Pre-checks (run against prod, read-only — also the diagnosis confirmation)

```sql
-- These two columns must NOT exist yet. 0 rows = missing-migration cause
-- confirmed → proceed. If either already exists → STOP, the cause is elsewhere.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'support_pages' AND column_name IN ('trusted_line','baby_stage');
-- Expect: 0 rows.

-- The enum must NOT already exist.
SELECT 1 FROM pg_type WHERE typname = 'baby_stage';
-- Expect: 0 rows.

-- Snapshot the row count so the verify step can prove nothing was disturbed.
SELECT count(*) AS pages_before FROM support_pages;
```

## 3. Apply

Run the whole `0009_pre_birth_invite_copy.sql` (it is wrapped in a single
`BEGIN … COMMIT`). By hand — not `drizzle-kit push`.

## 4. Verify (run against prod after apply)

```sql
-- Both columns exist, correct type, NULLABLE, no default.
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'support_pages' AND column_name IN ('trusted_line','baby_stage')
ORDER BY column_name;
-- Expect exactly 2 rows:
--   baby_stage    | USER-DEFINED | baby_stage | YES | (null)
--   trusted_line  | text         | text       | YES | (null)

-- Nothing disturbed: same count as pages_before; every existing row reads NULL.
SELECT count(*)             AS pages_after,
       count(trusted_line)  AS non_null_trusted,
       count(baby_stage)    AS non_null_stage
FROM support_pages;
-- Expect: pages_after = pages_before; non_null_trusted = 0; non_null_stage = 0.
```

Then re-test activation via "Make it live" — expect a 201 with a slug + manage
token, and the page visible at /s/:slug (or draft, if scheduled).

## 5. Rollback (only if genuinely needed)

Do not roll back casually. Because the live app now writes both columns, dropping
them would re-break activation. If you must, revert the app build **first**, then:

```sql
BEGIN;
ALTER TABLE "support_pages" DROP COLUMN IF EXISTS "trusted_line";
ALTER TABLE "support_pages" DROP COLUMN IF EXISTS "baby_stage";
DROP TYPE IF EXISTS "baby_stage";
COMMIT;
```
