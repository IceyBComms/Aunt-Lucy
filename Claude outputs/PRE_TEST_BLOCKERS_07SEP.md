# PRE_TEST_BLOCKERS_07SEP.md — what must be fixed before friendly testing

**Written by Cowork, Monday 7 September 2026, in answer to Kate: *"a short dot point list of things that really need to be fixed before further testing with friendly folk (family etc)."***

📌 **Kate's scope ruling, 7 Sep: *"I'll test all of them"* — gift page, organiser page AND the crisis path, and testers will both SET PAGES UP and CLAIM TASKS. So this list is ranked for the full surface, not one route.**

📄 **Built from the REPO record (`Documents\Aunt-Lucy\build\BUGS_AND_FIXES.md`, 98 open rows), not from the handover. Supersedes nothing — `POLISH_PLAN.md` remains the plan for making the product GOOD. This file is narrower: what stops the TEST producing usable answers.**

---

## ⚖️ The principle this list is ranked on

**Friendly testers forgive ugly. They do not forgive silent.**

🔑 **A bug that makes the product look rough gets REPORTED, which is the whole point of the test. A bug that makes the product look FINE while doing nothing gets reported as *"it seemed to work, but nothing happened"* — and that feedback is indistinguishable from a tester who simply didn't finish.** ❗ **So the ranking is not by severity. It is by how badly each bug CONTAMINATES THE FEEDBACK.**

---

## 🔴 TIER 1 — will silently break the test itself

### 1. #102 — the notification audience. **The single biggest risk to this test.**

**On an ORGANISER or CRISIS page the recipient is written into no notification audience at all.** `support_pages.recipient_email` / `recipient_mobile` are only ever written by `gifts.ts:566` and `manage.ts:315`. `organiser.ts:72` and `crisis.ts:157` insert the page without either.

🚨 **And the P7 reading is much bigger than the row: EVERY notification on a non-gift page resolves the same audience — claims, releases, reschedules, notes, reminders. A deferred recipient hears about NOTHING, ever.**

❗ **What this does to the test specifically: a tester sets up a page, a friend claims a task, and the tester is told nothing. They report *"it seemed fine but nothing happened."* One bug arrives wearing five costumes and the debrief is spent chasing costumes.**

⚠️ **STILL 🔴 AND STILL UNSETTLED AT ROOT.** **The 2 September audience trace was CHALLENGED THE SAME DAY by the recipient's own answer (she was gifted the page and set it up herself — so she WAS in the audience). Two live candidates remain, both cheap: (a) SMS-first channel break — a fixed-time release sets `wantSms`, channel order becomes `["sms","email"]`, the loop BREAKS on first success, so with a mobile on file the email is never sent; (b) an unhandled send rejection — `sendItem17Email` has no try/catch, the call site is `void`'d, and the release still returns `ok:true`.**

🚩 **FLAG: #102 IS NOT ON `START_HERE_NEXT.md`'s "four things for next session". It should be. It outranks all four for a testing week.**

### 2. #009 · #048 · #026 — sends the product cannot tell have failed

**Fire-and-forget sends stamped `sent` (#009, #048); the invite-dispatch cron still amber (#026).** **Invites are the first thing every tester touches.** ❗ **If nine of thirty invites land, the lesson learned is *"people didn't turn up"* — which is a false lesson about the product's appeal, not a true one about its plumbing.**

---

## 🟠 TIER 2 — will say the wrong thing to a real person

### 3. #076 — the activation explainer names the school run on EVERY occasion, including bereavement
**Live right now. `GiftActivation.tsx:390`. It is the first description of the product a grieving recipient reads, sitting above the task list.**

📌 **Blocked on a ten-minute ruling that has been outstanding since 30 August: `CLAUDE.md` says *"school pickup"*, shipped copy says *"school run"*. Both cannot be right.**

### 4. #064 · #065 — upbeat placeholder copy on Loss
**The buy form's note placeholder (*"enjoy every minute"*) and the team-signing card, which is fixed-tone across all five occasions and never receives the occasion at all.**

### 5. #002 — gift-for-yourself
**Kate bought one for herself and was emailed *"someone has bought this for you."*** ❗ **Included because Kate will hit this HERSELF while creating the test pages, repeatedly.**

---

## 🟡 TIER 3 — dead ends a tester cannot get out of

### 6. #071 — a draft page can be neither re-opened NOR deleted
❗ **Family testers get interrupted. That is the defining feature of testing with family.** **An interruption mid-setup loses the work and leaves a dead card on the dashboard permanently.**

### 7. #078 — "Make it live" with zero tasks activates for real
**And the pre-built suggestion list can never be reached again.** *(P1, with #071 and #063.)*

### 8. #101 — claiming a second task makes a helper type their details again
**Every tester who claims twice, which is most of them in a rehearsal.**

### 9. #110 — the helper has no way back to the page
**The claim confirmation offers two doors: add to calendar, or give the slot back. The most engaged person in the system is sent nowhere.** 🆕 **Second reason, named after the #037 merge: a PHONE-ONLY helper now has no calendar route at all. The same gap closes both.**

---

## 🔵 TIER 4 — legal and trust, at the moment details are collected

### 10. #106 — the footer sweep, seven routes still unswept
**`Manage`, `InviteClaim`, `GiftActivation`, `GiftSigning`, `Welcome`, `BuyDetails`, `not-found`.** ✅ **`ReleaseSlot` was CONFIRMED missing on 6 September — found by accident during the calendar build, not by the sweep.**

⚖️ **`GiftActivation` and `BuyDetails` both collect personal information. The footer is what carries the privacy link.**

🔑 **The pattern point is sharper than the instance: a row that ASKS FOR A SWEEP and never gets one looks identical, in the record, to a row that got one and came back clean. Report the empty hits as well as the hits.**

### 11. #090 — the Privacy Policy describes page closure in the present tense, for a feature that does not exist
**`PrivacyPolicy.tsx:175-183`, live: *"When a page is closed, it stops being visible to helpers."* Nothing anywhere sets `closed`.**

✅ **CHEAPEST HONEST MOVE FOR THE TESTING WEEK: amend the policy wording now, build closure properly after.** ⚠️ **Not a substitute for #090 — a cancer page above all others needs a way to stop — but it removes a live written promise the product cannot keep, in one edit, without the five rulings.**

---

## ✅ WHAT FRIENDLY TESTERS WILL FORGIVE — deliberately NOT on this list

**#107** *(muted contrast fails AA)* · **#083** *(cold unbranded dashboard)* · **#093** *(“1 slots”)* · **#092** *(“Icebreaker Communication”, singular)* · **#099** *(“Hi love”)* · **#040 · #021** *(crowded recipient screens)* · **#072** *(cold PIN screen)* · **#108** *(nothing expires)* · **#103** *(two documents both headed “Receipt”)* · **#107’s palette ruling.**

📌 **These are real and they are written down. They are also exactly what a friendly tester is FOR. Fixing them first spends the scarce thing — their goodwill and their attention — on the cheap problems.**

⚠️ **ONE EXCEPTION WORTH WATCHING: #107 is an accessibility failure, not a taste preference (`3.62:1` against a `4.5:1` requirement). If any tester is over about sixty, it stops being forgivable and becomes a blocker for that person.**

---

## 🚩 GAPS AND RISKS — not bugs, and on no list

1. ❗ **#110 AND #111 HAVE BRIEF FILES BUT NO ROWS IN `BUGS_AND_FIXES.md`.** **The open table stops at 109. Both exist only in loose build files and in the handover.** ⚖️ **The record's own rule is that the table is the truth; a finding that lives outside it is a finding that will be re-discovered later at full price.**
2. ⚠️ **`TRACKER.md`'s banner still reads *"Wednesday 2 September"*** **while its session log carries the 4, 5 and 6 September work. Flagged on 6 September and deliberately not acted on, because replacing it is overwriting existing content and that needs Kate's word. Now FIVE days stale.**
3. ⚠️ **`WHAT_BLOCKS_YOUR_FRIEND.md` and `REMAINING_WORK.md` (both 23 August) are STALE and carry no superseded marker.** **They still name #058, #033 and #035 as blocking; all three are green.** 📌 **`POLISH_PLAN.md` marks `REMAINING_WORK.md` superseded, but nothing marks `WHAT_BLOCKS_YOUR_FRIEND.md` — and its title makes it the file someone reaches for first.**
4. 🥇 **AND THE ONE THAT OUTRANKS THE WHOLE LIST, UNCHANGED SINCE 30 AUGUST: NOBODY EXCEPT KATE HAS EVER USED THIS PRODUCT END TO END.** **Every bug in the record was found by the person who built it.** 🔑 **This list exists to stop the test producing NOISE. It does not exist to make the product good — watching one real person struggle will re-rank everything under it, and should.**

---

## 🧭 THE SINGLE NEXT ACTION

⏭️ **SETTLE #102. Not fix it — SETTLE it.** **Two ranked candidates, both answerable without a build: was the released task FIXED-TIME or FLEXIBLE, and has the recipient looked at her TEXTS? Four Railway log strings discriminate the rest.**

**Everything else on this list is schedulable. #102 is the one that decides whether the testing week produces evidence or produces fog.**
