# Prod migration runbook — 0015_page_feedback

Backup-first, verify-first. Follows the house 0007 / 0008 / 0009 / 0011 pattern:
hand-applied SQL, never `drizzle-kit push`. **Purely additive** — one new table
and two indexes. No existing table is altered, no enum is created or extended,
no column is dropped or renamed, and no existing row is read or written.

**Status: APPLIED to production 2026-09-02** (Kate, via the Neon SQL editor — no
connection string was ever handed to Claude Code, matching house discipline).
The runbook was written *before* the code merged, which was the point; it is
kept as the record of what ran and how to re-run it against any fresh copy.

Steps 1–4 are done. **Step 5 is now satisfied, so the PR is clear to merge.**
Step 6 — proving it against the running system rather than a dashboard — is
still outstanding and happens after the merge deploys.

## Why this needed its own runbook

Bugs #022, #023, #033, #048 and #058 are all the same bug: code that reads or
writes a thing shipped to Railway before the thing existed, and real users got a
Postgres `42703 undefined_column` (or here, `42P01 undefined_table`) in the
middle of a live claim or activation.

> **Apply the migration first. Merge the PR second. Never the other way round.**

Here that direction is **required**, not merely prudent, and it is stricter than
0011's or 0014's. Those added nullable columns nothing yet read. This adds a
table the deployed code touches on **every single load of /manage** — the manage
view SELECTs from `page_feedback` to decide whether to show the form or the
thank-you. Merge first and every organiser's management page 500s.

The reverse order is completely safe and costs nothing: between apply and merge,
production carries an empty table no running code knows about.

## What it does

Creates `page_feedback`:

| Column | Type | |
|---|---|---|
| `id` | text | primary key |
| `page_id` | text NOT NULL | → `support_pages(id)` **ON DELETE CASCADE** |
| `grant_id` | text NULL | → `page_grants(id)` **ON DELETE SET NULL** |
| `went_well` | text NULL | *"Did people show up? Tell us how it went."* |
| `got_in_the_way` | text NULL | *"Anything get in the way?"* |
| `created_at` | timestamp NOT NULL | default `now()` |

Plus `page_feedback_page_id_idx` and `page_feedback_grant_id_idx`.

**Both text columns are nullable and both stay nullable.** Either question alone
is a complete answer — the route refuses only when both are empty — so a NOT
NULL on either would make one of the two valid submissions impossible.

**`grant_id` is SET NULL, not CASCADE, and that asymmetry is deliberate.**
Losing the attribution ("which management link it came from") is survivable.
Losing the words is not. `page_id` cascades because feedback with no page has no
subject, and that path is unreachable in practice anyway: only an unclaimed
DRAFT can be deleted (`draftDeletion.ts`), and the form is never offered until a
task has been claimed.

## Why a table at all, rather than just an email

The cheaper variant — send to `hello@` and store nothing — was considered and
rejected while **#102 is unexplained**. On 2 September a real notification
reached nobody, no email and no SMS, on a page whose audience was populated, and
the leading candidate is a send that threw and logged nothing.

Feedback that vanished the same way would be worse than no button at all: the
person spent their goodwill, Kate got nothing, and nobody would ever find out.
So the row is the record and the email is only the notification — and the route
writes the row **first**. A failed send costs Kate an email; it never costs
someone their words. That ordering is asserted directly against a real database
in the rehearsal below, with the send sabotaged on purpose.

## ⚠️ Privacy — read before writing any query against this table

`went_well` and `got_in_the_way` will contain real detail about real illnesses
and real deaths, written by people at their lowest.

- **It goes to Kate and nowhere else.** Never rendered on any page, public or
  private. There is deliberately **no drizzle relation** from `support_pages` to
  this table, so a `with:` on the manage query cannot pull the text out by
  accident.
- **A piece of feedback is NEVER used as a testimonial, on the site or anywhere
  else, without asking that person first.** #095 exists because a buyer
  suspected a con; a quote lifted without permission is exactly what a
  suspicious reader is braced for, and unlike a weak badge it is a real breach
  of that person's trust.
- The text is never written to the application logs. The failure path logs the
  row's `id` only — enough to read it out of the table, nothing more.

## Order of operations

1. Take the backup (below).
2. Run the pre-checks against prod.
3. Apply `0015_page_feedback.sql`.
4. Run the verify queries.
5. **Tell Claude Code it is applied.**
6. *Only then* merge the PR → Railway/Vercel deploy the code that uses the table.
7. Prove it against the running system (§6) — not a dashboard.

No post-deploy step. There is nothing to drop and nothing to backfill.

## 1. Back up first

On Neon, create a branch/copy of production **before** applying, exactly as
0009 used `pre-0009-safety` and 0011 used `pre-0011-safety`:

```
# Neon console → Branches → New branch from `production` (name e.g. pre-0015-safety)
```

Keep that branch until feedback has been seen arriving in prod.

## 2. Pre-checks (run against prod, read-only)

```sql
-- The table must NOT exist yet. 0 rows = proceed.
SELECT table_name FROM information_schema.tables WHERE table_name = 'page_feedback';
-- Expect: 0 rows.

-- Both parent tables must exist (the FKs depend on them).
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('support_pages', 'page_grants') ORDER BY table_name;
-- Expect exactly 2 rows: page_grants, support_pages.

-- Snapshot so the verify step can prove nothing else was disturbed.
SELECT (SELECT count(*) FROM support_pages) AS pages_before,
       (SELECT count(*) FROM page_grants)   AS grants_before;
```

## 3. Apply

Run the whole `0015_page_feedback.sql` (wrapped in a single `BEGIN … COMMIT`).
By hand in the Neon SQL editor — **not** `drizzle-kit push`, and without handing
a connection string to Claude Code.

## 4. Verify (run against prod after apply)

```sql
-- Six columns, in this order, with only page_id NOT NULL.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'page_feedback'
ORDER BY ordinal_position;
-- Expect:
--   id             | text                        | NO  | (null)
--   page_id        | text                        | NO  | (null)
--   grant_id       | text                        | YES | (null)
--   went_well      | text                        | YES | (null)
--   got_in_the_way | text                        | YES | (null)
--   created_at     | timestamp without time zone | NO  | now()

-- The two foreign keys, with the right delete rules. This is the one that
-- matters: 'n' on grant_id is what stops a revoked grant taking someone's
-- words with it.
SELECT conname, confrelid::regclass AS refs, confdeltype
FROM pg_constraint WHERE conrelid = 'page_feedback'::regclass AND contype = 'f'
ORDER BY conname;
-- Expect page_id  → support_pages with confdeltype 'c' (cascade),
--        grant_id → page_grants   with confdeltype 'n' (set null).

-- Both indexes, plus the primary key.
SELECT indexname FROM pg_indexes WHERE tablename = 'page_feedback' ORDER BY indexname;
-- Expect: page_feedback_grant_id_idx, page_feedback_page_id_idx, page_feedback_pkey

-- The table starts empty; nothing backfills it.
SELECT count(*) FROM page_feedback;
-- Expect: 0.

-- Nothing else disturbed.
SELECT (SELECT count(*) FROM support_pages) AS pages_after,
       (SELECT count(*) FROM page_grants)   AS grants_after;
-- Expect: identical to the pre-check snapshot.
```

## 5. Then merge, and only then

Tell Claude Code the migration is applied. Merge the PR. Railway rebuilds the
API; Vercel rebuilds the frontend.

⚠️ Vercel's Root Directory is `artifacts/api-server`, so a frontend-only commit
can be silently skipped — confirm the frontend actually rebuilt, not just the
backend. This PR changes both, so both must move.

## 6. Prove it against the running system

A green Neon dashboard and a green Railway build prove the deploy happened, not
that the feature works.

```bash
curl -s https://www.auntlucy.com.au/api/healthz
```

⚠️ **The host is `www.auntlucy.com.au` and the field is `commit`.** There is no
`api.auntlucy.com.au` — it does not resolve, and curl returns nothing at all
(HTTP 000), which reads like a dead backend when the backend is fine. A healthy
answer looks like:

```json
{"status":"ok","commit":"79e8384a1fee35ac22e4c84af243b8bea6c09bb4"}
```

Expect `commit` to match the merge commit. `commit` is baked into the
API-SERVER build, so a merge Railway did not rebuild keeps reporting the
previous commit — which is exactly what this check is for.

Then, against a real page with at least one claimed task, open its `/manage`
link and confirm:

1. The block is there, below "Who has access".
2. It is **absent** on a page with no claims.
3. Sending one line arrives at `hello@auntlucy.com.au` **with the page name and
   the occasion in the subject**.
4. The thank-you replaces the form and is **still there after a reload** — that
   is the "did that actually save?" doubt closed, and it matters more than usual
   here because #102 has already proved this product can swallow something
   silently.

And the query that answers the only question that really matters:

```sql
SELECT id, page_id, grant_id, created_at,
       (went_well IS NOT NULL)      AS answered_1,
       (got_in_the_way IS NOT NULL) AS answered_2
FROM page_feedback ORDER BY created_at DESC LIMIT 10;
```

Deliberately **not** `SELECT *` — see the privacy section. Read the words in
Kate's inbox, not in a shared terminal.

## 7. Rollback (only if genuinely needed)

Safe to roll back **only while the app code is not yet deployed** (i.e. before
step 5). Once /manage reads the table, revert the app build **first**, then:

```sql
BEGIN;
DROP TABLE IF EXISTS "page_feedback";
COMMIT;
```

Dropping the table destroys any feedback already left in it and nothing else —
no page, claim, contact, grant or gift data is touched. If any rows exist,
export them first; they are the one thing here that cannot be recreated.
