# Prod migration runbook — 0008_item17_task_flexibility

Backup-first, verify-first. Follows the house ITEM9 / 0007 pattern: hand-applied
SQL, never `drizzle-kit push`. This migration is **purely additive** (one enum,
one NOT NULL column with a safe default, one non-destructive backfill) so there
is no `DROP` to sequence after a deploy — but back up anyway.

## What it does

- Creates enum `slot_flexibility` = `('flexible','fixed')`.
- Adds `slots.flexibility` — `NOT NULL DEFAULT 'fixed'`.
- Backfills existing rows to `'flexible'` **only** where the category is a meal,
  grocery run, dog walk, or an **undated** errand. Everything else stays `fixed`.

## Order of operations

Because the column has a default and the backfill only promotes `fixed →
flexible`, the migration is safe to run **before** the new application code is
deployed (old code simply ignores the column). Recommended order:

1. Take the backup (below).
2. Run the pre-checks.
3. Apply `0008_item17_task_flexibility.sql`.
4. Run the verify queries.
5. Deploy the Item 17 application code (Railway) + frontend (Vercel).

No post-deploy step is required — there is nothing to drop.

## 1. Back up first

On Neon, create a branch/copy of production **before** applying, exactly as
ITEM9 used `ep-blue-block`:

```
# Neon console → Branches → New branch from `production` (name e.g. ep-item17-pre-0008)
```

Keep that branch until Item 17 has been verified in prod for a few days.

## 2. Pre-checks (run against prod, read-only)

```sql
-- The column must NOT already exist (fresh apply expected).
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'slots' AND column_name = 'flexibility';
-- Expect: 0 rows.

-- The enum must NOT already exist.
SELECT 1 FROM pg_type WHERE typname = 'slot_flexibility';
-- Expect: 0 rows.

-- Snapshot the category distribution so the backfill result can be checked.
SELECT slot_type, (slot_date IS NULL) AS undated, count(*)
FROM slots
GROUP BY slot_type, undated
ORDER BY slot_type, undated;
```

## 3. Apply

Run the whole `0008_item17_task_flexibility.sql` (it is wrapped in a single
`BEGIN … COMMIT`).

## 4. Verify (run against prod after apply)

```sql
-- Column exists, correct type + default, NOT NULL.
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'slots' AND column_name = 'flexibility';
-- Expect: udt_name = slot_flexibility, is_nullable = NO,
--         column_default = 'fixed'::slot_flexibility

-- No NULLs (guards against a botched add).
SELECT count(*) FROM slots WHERE flexibility IS NULL;
-- Expect: 0.

-- Backfill landed on exactly the intended categories.
SELECT slot_type, (slot_date IS NULL) AS undated, flexibility, count(*)
FROM slots
GROUP BY slot_type, undated, flexibility
ORDER BY slot_type, undated, flexibility;
-- Expect: meal/shopping/dog_walking → flexible;
--         errand undated → flexible, errand dated → fixed;
--         school_pickup/child_care/visit/other → fixed.
```

## 5. Rollback (only if needed, before the app deploy)

Additive, so rollback is a clean drop of the new objects:

```sql
BEGIN;
ALTER TABLE "slots" DROP COLUMN IF EXISTS "flexibility";
DROP TYPE IF EXISTS "slot_flexibility";
COMMIT;
```

(If the app code has already shipped, do not roll back — redeploy the previous
app build first, since new code reads `slots.flexibility`.)
