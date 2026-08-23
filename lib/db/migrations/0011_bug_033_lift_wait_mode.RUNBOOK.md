# Prod migration runbook — 0011_bug_033_lift_wait_mode

Backup-first, verify-first. Follows the house 0007 / 0008 / 0009 pattern:
hand-applied SQL, never `drizzle-kit push` (the enum-rename ambiguity that bit
0001 applies to any migration that creates a type). **Purely additive** — one
enum, one NULLABLE column, no default, no backfill, no drop.

**Status: NOT YET APPLIED.** ⚠️ **This PR must not be merged until Kate has
applied this migration to production and said so.** See "Order of operations" —
unlike 0009, the sequencing here is deliberate and it is the whole reason this
runbook is written before the code.

## Why this needed its own runbook

Bugs #022 and #023 were both *merged-but-unapplied* migrations: code that read or
wrote a column shipped to Railway before the column existed, and the live claim
and activation paths threw Postgres `42703 undefined_column` at real users.

This migration is written **before** its application code for exactly that
reason. The rule for this change:

> **Apply the migration first. Merge the PR second. Never the other way round.**

That ordering is safe here and costs nothing, because the column is nullable with
no default: production can carry `slots.lift_wait_mode` for days with no code
reading it, and nothing changes for anyone until the app deploys.

## What it does

- Creates enum `lift_wait_mode` = `('drop_off', 'wait', 'pick_up')` (guarded `DO`
  block, so a partial re-run is a no-op).
- Adds `slots.lift_wait_mode` — `lift_wait_mode`, **nullable, no default**.

**NULL is meaningful and is the state of every existing row.** It means "this
task is not a lift, or nobody has said yet" — and every surface renders *nothing*
at all for it: no control on the tile, no clause in the confirmation email, no
words in the SMS, and the existing default calendar duration. A dated
"pick up a prescription" errand is a NULL row and must stay visually identical to
how it looks today.

That is not an incidental property; it is the design decision that lets this
column double as the marker for *"this task is a lift"* without adding a `lift`
value to the `slot_type` enum. An `ALTER TYPE ... ADD VALUE` on `slot_type` is
the failure shape that needed the `0003` enum catch-up, and every `switch` on
`slotType` across the API and frontend would have needed a new case. This avoids
both.

Existing rows read NULL and are otherwise untouched. No claim state, no gift or
Stripe table, and no trusted-contact/sensitivity column is involved.

## Order of operations

**The sequencing matters, and it is the opposite of 0009's.**

1. Take the backup (below).
2. Run the pre-checks against prod.
3. Apply `0011_bug_033_lift_wait_mode.sql`.
4. Run the verify queries.
5. **Tell Claude Code it is applied.**
6. *Only then* merge the PR → Railway/Vercel deploy the code that reads the column.
7. Prove it against the running system (§6) — not a dashboard.

Between steps 3 and 6 production is in a safe intermediate state: the column
exists and nothing reads it. There is no window in which deployed code can hit a
missing column.

No post-deploy step — there is nothing to drop.

## 1. Back up first

On Neon, create a branch/copy of production **before** applying, exactly as
0009 used `pre-0009-safety` and 0008 used `ep-item17-pre-0008`:

```
# Neon console → Branches → New branch from `production` (name e.g. pre-0011-safety)
```

Keep that branch until lifts have been verified in prod for a few days.

## 2. Pre-checks (run against prod, read-only)

```sql
-- The column must NOT exist yet. 0 rows = proceed.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'slots' AND column_name = 'lift_wait_mode';
-- Expect: 0 rows.

-- The enum must NOT already exist.
SELECT 1 FROM pg_type WHERE typname = 'lift_wait_mode';
-- Expect: 0 rows.

-- Snapshot so the verify step can prove nothing was disturbed.
SELECT count(*) AS slots_before,
       count(*) FILTER (WHERE is_claimed) AS claimed_before
FROM slots;
```

## 3. Apply

Run the whole `0011_bug_033_lift_wait_mode.sql` (it is wrapped in a single
`BEGIN … COMMIT`). By hand in the Neon SQL editor — not `drizzle-kit push`, and
without handing a connection string to Claude Code.

## 4. Verify (run against prod after apply)

```sql
-- The column exists, correct type, NULLABLE, no default.
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'slots' AND column_name = 'lift_wait_mode';
-- Expect exactly 1 row:
--   lift_wait_mode | USER-DEFINED | lift_wait_mode | YES | (null)

-- The enum has exactly the three expected values, in order.
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'lift_wait_mode' ORDER BY enumsortorder;
-- Expect: drop_off, wait, pick_up

-- Nothing disturbed: same counts, and every existing row reads NULL.
SELECT count(*)                  AS slots_after,
       count(*) FILTER (WHERE is_claimed) AS claimed_after,
       count(lift_wait_mode)     AS non_null_wait_mode
FROM slots;
-- Expect: slots_after = slots_before; claimed_after = claimed_before;
--         non_null_wait_mode = 0.
```

## 5. Then merge, and only then

Tell Claude Code the migration is applied. Merge the PR. Railway rebuilds the
API; Vercel rebuilds the frontend.

⚠️ Vercel's Root Directory is `artifacts/api-server`, so a frontend-only commit
can be silently skipped — confirm the frontend actually rebuilt, not just the
backend.

## 6. Prove it against the running system

A green Neon dashboard and a green Railway build prove the deploy happened, not
that the feature works. Check the running system:

```bash
curl -s https://api.auntlucy.com.au/api/healthz
```

Expect the `sha` in the response to match the merge commit. If it does not, the
deploy has not landed yet and nothing below is meaningful.

Then, against a real page:

```bash
curl -s https://api.auntlucy.com.au/api/pages/<slug> | grep -o '"liftWaitMode":[^,]*'
```

Expect `"liftWaitMode":null` on every existing task — proof the new field is
being served and that existing tasks are unaffected.

Finally, the end-to-end check that a dashboard cannot give you: add a lift with
"Wait and bring them home", claim it, and confirm the answer appears in the
confirmation email, in the SMS if claimed with a phone number, and — the one that
gets forgotten — that the calendar entry blocks out the longer duration rather
than the default hour.

## 7. Rollback (only if genuinely needed)

Safe to roll back **only while the app code is not yet deployed** (i.e. before
step 5). Once the app reads the column, revert the app build **first**, then:

```sql
BEGIN;
ALTER TABLE "slots" DROP COLUMN IF EXISTS "lift_wait_mode";
DROP TYPE IF EXISTS "lift_wait_mode";
COMMIT;
```

Dropping the column loses only the wait-mode answers; no claim, no contact and no
gift data is touched.
