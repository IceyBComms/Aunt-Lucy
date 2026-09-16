# Migration 0016 — PROPOSAL (not applied, not in `lib/db/migrations/`, no code depends on it)

**Status: proposed 16 Sep 2026 by Claude Code, for Kate to rule on.** Nothing in PR
`claude/helper-note-flow` reads or writes these columns, so that PR merges safely
without this. The production credential is dead; Kate applies migrations from the
Neon SQL editor, house pattern (hand-written SQL, never `drizzle-kit push`).

It unblocks the three parts of the helper-note build that could not be done without
a schema change:

| Part of the brief | Why it needs a column |
|---|---|
| Step 4 — crisis setup asks for the setup person's **mobile** | See "Why not an existing column" below. |
| Step 3 — each note shows **when it was left** ("Note · Wed 4:12pm") | `slots` has no timestamp for a note. `claimed_at` is when the task was claimed. |
| Step 5 — a later note must not **erase the claim-time note** | Both live in one column, `slots.claimed_note`; the note route overwrites it. |

## The SQL

```sql
-- 0016 — setup person's mobile; a helper's later note kept apart from the claim note.
-- PURELY ADDITIVE: three nullable columns, no default, no backfill, no constraint,
-- no enum, nothing dropped or renamed. No existing row is read or written.
-- IDEMPOTENT: every statement guards with IF NOT EXISTS.

ALTER TABLE page_grants ADD COLUMN IF NOT EXISTS person_mobile text;

ALTER TABLE slots ADD COLUMN IF NOT EXISTS helper_note text;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS helper_note_at timestamp;
```

## Why not an existing column

- **`support_pages.recipient_mobile`** is the *recipient's* number. `buildNotifyTargets`
  (`artifacts/api-server/src/lib/notifyTargets.ts`) marks that target
  `isRecipient: true`, which drives the addressee in claim copy. On a crisis page run
  by a sister, storing HER mobile there tells her help has "shown up for you" — the
  #039 fault. It would only be correct on a for-self page.
- **`page_grants.person_contact`** holds ONE contact, and the crisis setup grant already
  uses it for the email. A second grant row for the same person with the mobile would
  make two notify targets for one human: every urgent note would go by SMS **and** email.
  (That double send already happens today on a for-self crisis page if someone adds a
  mobile via /manage → details: page-level mobile + grant email = two targets.)
- **`slots.claimed_note`** is shared between the claim-time note and every later note.

## What the code would do once applied (follow-up PR, not built)

1. **Crisis form** (`rally/src/pages/HardestTimes.tsx`, `routes/crisis.ts`): required field
   "Your mobile" / "So urgent updates about your tasks reach you by text."
   (✅ **approved by Kate, 16 Sep 2026**). Stored on the setup grant's `person_mobile` via
   `grantSetupPersonAccess`. Validation: see "To decide / build with 0016" below — the
   existing `isPhoneNumber` is NOT good enough for this field.
2. **`buildNotifyTargets`**: a grant's `person_mobile` joins the SAME target as its
   `person_contact` email (one person → one target → SMS preferred, email fallback),
   de-duplicated against the page-level contact like every other contact point.
3. **Note route** (`routes/slots.ts`): writes `helper_note` + `helper_note_at`, leaves
   `claimed_note` alone. Reschedule-with-note the same.
4. **/manage**: shows the claim-time note as today, and the later note with
   "Note · Wed 4:12pm" from `helper_note_at` (Australia/Sydney).
5. **Release** (`routes/slots.ts`): clear `helper_note`/`helper_note_at` alongside the
   other claim columns so a re-claimed slot doesn't show the last helper's note.

## Already approved (Kate, 16 Sep 2026)

- ✅ The crisis mobile field: "Your mobile" / "So urgent updates about your tasks reach you
  by text."
- ✅ The flexible-task time-change line `Their note: "{note}"` — shipped in PR #126, listed
  here only so the rulings sit together.

## To decide / build with 0016 (Kate, 16 Sep 2026 — noted, NOT built)

1. **A proper Australian mobile check for the required crisis field.** Accept `04xx xxx xxx`
   and `+614…` (with the spacing and punctuation people type). The only phone check in the
   codebase today, `isPhoneNumber` in `artifacts/api-server/src/lib/contactChannel.ts`, is
   deliberately loose — any 8–15 digits — so a typo'd or landline number would be accepted
   and urgent texts would silently go nowhere. This field is REQUIRED and exists only to
   carry urgent texts, so it needs the strict check, in both the form and `routes/crisis.ts`.
2. **Kate to decide: should pages get their own time zone?** "Today" / "tomorrow"
   (`lib/australianDay.ts`) uses Sydney's calendar for every page. At 10:30pm in Perth it is
   already 12:30am the next day in Sydney (1:30am in daylight saving), so a Perth helper's
   note about **tomorrow's** task would tell the family "today". Brisbane and Adelaide are
   affected in a narrower window. Fixing it needs a per-page time zone (another column, and
   a question for whoever sets the page up).
3. **Privacy Policy wording — Kate to approve before 0016 ships.** The policy
   (`artifacts/rally/src/pages/PrivacyPolicy.tsx`) lists "the recipient's first name, email
   and/or mobile" under "From the person being supported (and whoever sets up for them)". It
   does not explicitly name the **setup person's own mobile**, which 0016 would start
   collecting as a required field.

## Existing rows

- **Existing crisis pages**: no mobile, no backfill. They stay email-only for task events,
  exactly as today, unless someone adds a number in /manage → details (which today makes
  the double send described above).
- **Existing notes**: whatever is in `claimed_note` stays there and renders as today —
  for a slot whose helper already left a later note, the claim-time note is already gone
  and cannot be recovered. `helper_note_at` is null for all of them, so they show no time.

## Walkthrough (Kate, Neon SQL editor)

1. **Back up first**: create a Neon branch from production (as for 0004 / 0015).
2. **Check the columns don't exist:**
   ```sql
   SELECT table_name, column_name FROM information_schema.columns
   WHERE (table_name = 'page_grants' AND column_name = 'person_mobile')
      OR (table_name = 'slots' AND column_name IN ('helper_note', 'helper_note_at'));
   ```
   Expect **0 rows**.
3. **Run the SQL above** on production.
4. **Verify:** re-run step 2. Expect **3 rows**. Then
   `SELECT count(*) FROM slots WHERE helper_note IS NOT NULL;` → **0**.
5. **Only then** merge the follow-up PR that reads these columns. Apply first, merge
   second — #022, #023, #033, #048, #058 were all the other order.
6. **After deploy**: a fixed-task note for tomorrow on a new crisis page that has a mobile
   — a text arrives, and /manage shows both notes with a time on the later one.
