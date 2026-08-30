> 📥 **COPIED INTO THE REPO 30 August 2026 by Cowork.** **It was never lost — it has been in `OneDrive\aunt-lucy\build\` since 12 August, where Claude Code cannot see it.** ⚠️ **Same courier failure as `BUG058_SURGERY_COPY.md` this morning: banked in the folder, invisible to the builder, and eight days of a live bug went unfixed partly because of it.**
> ⚠️ **READ-ONLY IN THE REPO. Canonical copy lives in OneDrive; if it changes there, Cowork re-copies it here.**
> 📌 **STILL ACCURATE — Claude Code independently re-verified the mechanism on 30 August and reached the same three findings. Two things have changed and are noted at the foot of this file.**

---

# PR #58 — fix finding #1 (claim notifications don't fan out), then re-verify

> Banked by Cowork, 12 August 2026, off the back of the full PR #58 sandbox verification. **Do not merge #58 until this is fixed and re-tested.** The disposable branch (`br-super-pond-a7i61g53`, `pr58-verify-20260812`) and both local servers were left running at the end of the verification — check whether they're still up before rebuilding anything from scratch.
>
> **Kate: paste everything in the box below into the SAME Claude Code chat that ran the verification**, if it's still open (it has the disposable branch context already) — otherwise a fresh chat is fine, just tell it to check for the existing branch/servers first per the prompt below.

---

## The finding (for context, not to paste)

Verification found that PR #58's section D (widened notifications) only covers **release / reschedule / note** events — it widened `notifyRecipientOfTaskEvent`. But the "someone claimed a task" alert — the single most common notification in the whole product — goes through a **different, older, batched function**, `sendRecipientClaimNotification` (`internal.ts:511`), which section D never touched. That function only reads `page.recipientEmail` directly and is **skipped entirely when `recipientEmail` is null**.

Crisis and organiser pages never populate `page.recipientEmail` by default (only section E's "yes, ready" path mints a recipient contact, and even then it lives on a `page_grants` row, not `page.recipientEmail`). So today, and even after PR #58 merges as currently built, claiming a task on a friend-run crisis/bereavement page notifies **nobody at all** — not the recipient, not the manager running things. That directly contradicts the original reason Item 18 was built ("admin SMS currently mis-routes to the grieving recipient" — the fix was supposed to make sure the right person hears about it, not that nobody does).

---

## Paste this into Claude Code

```
Resuming Aunt Lucy (repo IceyBComms/Aunt-Lucy), PR #58 (claude/page-access-grants). Read CLAUDE.md first.

Before anything else: check whether the disposable Neon branch from the last verification session (br-super-pond-a7i61g53, endpoint ep-fancy-thunder-a7f6x8co) and the local backend (:3001) / frontend (:5173) are still running and still pointed at that branch. If so, reuse them — don't rebuild the sandbox from scratch. If they're gone, recreate a fresh disposable branch off production the same way (photocopy, confirm the host is NOT ep-spring-term before every DB command, same hard guardrails as before).

## The bug to fix

sendRecipientClaimNotification (internal.ts:511) is what actually sends the "someone claimed a task" alert — NOT notifyRecipientOfTaskEvent, which section D widened. sendRecipientClaimNotification only reads page.recipientEmail and is skipped entirely when that's null (internal.ts:456,488) — which crisis/organiser pages always are unless section E's "yes, ready" path was used. Result: on a friend-run crisis/bereavement page, claiming a task notifies nobody.

## Investigate first — don't guess

1. Confirm exactly how sendRecipientClaimNotification's batching works today — what triggers it, what window/delay, is it per-page or per-recipient, and does the batching logic itself assume a single recipient anywhere. This matters because the existing working case (a self-setup gift page with a real recipientEmail) must keep working exactly as it does now — don't regress the one path that's currently fine.
2. Confirm whether the cleanest fix is (a) widening sendRecipientClaimNotification itself to fan out to every active grant-holder the same way notifyRecipientOfTaskEvent was widened in section D, or (b) routing claim notifications through the already-widened notifyRecipientOfTaskEvent instead of the separate batched function. Recommend one, with reasoning, before building — I'll confirm quickly, this doesn't need a long wait.

## Build the fix

- Fan the claim notification out to every currently active grant-holder's own contact, same de-duplication guarantee already proven for release/reschedule/note in section D.
- Preserve the exact existing behaviour and timing for the current working case (single recipient grant with a real contact) — this must not regress.
- If batching logic needs touching, keep it as close to its current shape as possible — don't redesign the batching system, just make sure it reaches everyone with active access.

## Re-verify on the sandbox

Using the same disposable branch: claim a slot on a page that has BOTH a recipient grant and a manager grant (the two-grant-holder test page from the earlier verification, or a fresh equivalent) and confirm BOTH get a claim notification, each exactly once. Then claim a slot on a crisis/organiser-style page with NO recipientEmail and only grants (a section-E "yes" page, or the earlier seeded manager-only page) and confirm the active grant-holder(s) now DO get notified — this is the case that was previously silent.

## Guardrails

- Same hard prod-safety rules as the original verification: never run anything against ep-spring-term, print and confirm the host before every DB command, no real emails/SMS to anyone but Kate, only write to the disposable branch.
- PR only — do not merge, do not close.
- Don't touch sections A/B/C/E — they're already fully verified and working, leave them alone.
- Typecheck + prod build must stay clean after the fix.

Report back: what you found on the batching question, which fix approach you took and why, the new verification results (both re-test cases), and confirmation typecheck/build are clean. Leave the branch and servers running again when done.
```

---

## After this comes back clean

- Read the report, confirm both re-test cases pass with real evidence (not just "should work now").
- The other two findings from the original verification need no further build work: the dead 409 message is cosmetic (leave or trim later, your call), and the nudge-reachability gap is the same one already flagged — this verification just confirms it harder, doesn't change the plan (ship section E as-is, decide separately on a dashboard follow-up for the nudge).
- Once this fix is verified, PR #58 is genuinely ready for your own click-through and merge.

---

## 🕰️ WHAT HAS CHANGED SINCE 12 AUGUST — read before pasting

**1. PR #58 MERGED UNFIXED on 22 August.** ❗ **This is no longer a pre-merge gate. The bug is LIVE and has been for eight days — confirmed against `origin/main` at `543f782`, the commit `/api/healthz` reports as serving traffic.** **The prompt's *"PR only — do not merge"* still stands, but it now applies to a NEW branch off `main`, not to `claude/page-access-grants`.**

**2. THE SANDBOX IS ALMOST CERTAINLY GONE, AND THE PROD CREDENTIAL IS DEAD.** **The disposable Neon branch `br-super-pond-a7i61g53` dates from 12 August, and the root `.env` credential now fails with `28P01`. So the re-verification section cannot run as written.**

⚖️ **COWORK'S RECOMMENDATION, following the #048 precedent set today: prove it with TESTS rather than a live sandbox.** **Build the fan-out, write the two cases as tests — a page with recipient + manager grants, and a crisis-style page with grants and NO `recipientEmail` — then SABOTAGE each one to prove the assertions are load-bearing.** 📌 **That is exactly how #048 was proven this morning, and it needs no database.**
✅ **Then it stays 🟡 until Kate sets up a real crisis page, claims a task, and sees the notification arrive. That human check is better evidence than a sandbox, and she is testing today anyway.**

**3. ONE FINDING IN THE ORIGINAL IS NOW KNOWN TO BE UNDERSTATED.** **The prompt says crisis pages are silent *"unless section E's 'yes, ready' path was used"*.** ❌ **That exemption is FALSE.** **`grantRecipientAccess` writes `personContact` onto a `page_grants` row and never touches `support_pages.recipient_email` — so there is NO configuration of the crisis path where claim notifications work. Looping the affected person in does not rescue it.**

**4. AND THE LIVE ASYMMETRY IS WORTH STATING IN THE FIX ITSELF.** **Release, reschedule and note DO fan out to every unrevoked grant-holder. Claims do not.** **So on a crisis page today, a helper GIVING BACK a task notifies the managers, and a helper TAKING one notifies nobody.** 🔑 **Two halves of the same event went down two code paths and only one got widened — which is precisely how this stayed invisible for eight days.**
