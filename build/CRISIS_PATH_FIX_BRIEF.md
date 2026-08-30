> 📥 **COPIED INTO THE REPO 30 August 2026 by Cowork.** ⚠️ **THIRD COURIER FAILURE OF THE DAY — after `BUG058_SURGERY_COPY.md` this morning and `PR58_FIX_CLAIM_FANOUT_PROMPT.md` this afternoon. Written into `OneDrive\aunt-lucy\build\`, where Claude Code cannot see it, and then referenced in a prompt as though it could.**
> ✅ **RULE ADOPTED, so there isn't a fourth: any brief, prompt or approved copy that CLAUDE CODE must read is written into the REPO's `build/` or `content/` at the moment it is created — not into the OneDrive folder and copied later.** **The OneDrive folder is for Kate. The repo is for the builder. A document meant for the builder that lives only in Kate's folder is not a document, it's a rumour.**
> ⚠️ **READ-ONLY IN THE REPO. Canonical copy lives in OneDrive; if it changes there, Cowork re-copies it here.**

---

# CRISIS_PATH_FIX_BRIEF.md — the hardest-times path

**Written by Cowork, Sunday 30 August 2026, afternoon.** Paste-ready for the **Claude Code desktop app**.
⚠️ **RE-PRIORITISED AT KATE'S INSTRUCTION. `POLISH_PLAN.md` ranked this SEVENTH of eight because the path isn't promoted. That was wrong, and Kate was right to overrule it.**

---

## 🔑 Why this outranks everything else on the list

**`/hardest-times` is LIVE. It's unlinked, not unreachable.** **And the FAQ Kate wants published links to it three times — so publishing that page promotes this path.**

❗ **But the real argument isn't sequencing. The people who reach this path are the least resilient users in the product meeting the least finished part of it.** **Someone setting up help for a dying relative is not going to work around a confusing form or a dashboard full of dead drafts. They will close the tab, and nobody will ever know they tried.**

📌 **Every other group on the polish list can wait for someone who is having a normal week.**

---

## 🚨 CHECK THIS FIRST — before building anything

**#025 may have been live for a week, and if it is, it's the most serious item here.**

**The row says: *"This is a 'do not merge PR #58 until fixed' item, not a follow-up."* PR #58 MERGED on 22 August.** **Either the banked fix (`build/PR58_FIX_CLAIM_FANOUT_PROMPT.md`) went in first, or it didn't.**

**If it didn't: on a crisis or organiser page, someone claiming a task notifies NOBODY.** **Not the recipient, not the person running it.** **A friend says *"I'll bring dinner Tuesday"*, and the person who set the page up never finds out — which is the single thing the page exists to tell them.**

⚖️ **Its status line also still reads *"not yet live since unmerged"*, which is stale on its face. Whatever the answer, that row needs correcting.**

---

## The order, and why

| | Bug | Why here | Est. |
|---|---|---|---|
| **0** | **#025 — verify first, fix if live** | If live it outranks everything below | **check + 1 hr** |
| **1** | **#071 — a draft can't be re-opened or deleted** | **Data the person created and cannot reach.** Interruption is the single most likely thing to happen to someone in crisis | **1.5–2 hr** |
| **2** | **#070 — the form never asks who it's for** | Wrong at the root: everything downstream inherits the muddle | **1 hr** |
| **3** | **#074 — the texted link lands on an admin screen** | First thing the recipient ever sees | **1 hr** |
| **4** | **#072 — the PIN screen is cold** | Pure copy, and it's the first Aunt Lucy some helpers meet | **20 min** |
| **5** | **#073 — the wait pill won't say how long** | The residual of #033. The number already exists | **30 min** |

✅ **TWO OF THESE ALREADY HAVE THEIR ANSWER IN THE PRODUCT — do not invent a second one.** **#070's fork exists in `BuyDetails.tsx` (`showFork = !isWorkplace`, with the for-self name read-back). #074's opener exists as #035's approved copy. Both need porting, not designing.**

---

## ✍️ Copy — approved shapes, Kate's final word

### #072 — the PIN screen
**Replace *"Protected Page — This support page requires a PIN to view. Please enter it below."***

> ### Just checking it's you
> **This page is kept private, so it needs a short code. Whoever sent you the link will have it.**
> *(field: **Your code**  ·  button: **Open the page**)*

📌 **No name is interpolated deliberately — the page is protected, so the name may not be available, and a blank there would read as a fault.** ✅ **The PIN feature itself is a hit — Kate liked it unprompted. This is only the words.**

### #074 — the intro before the management screen

> ### [Ellen] set this page up for you
> **When people say *"let me know if I can help"*, nobody ever knows what to say back. This page turns that into something practical: the people around you can see what would actually help, and pick something — without you having to ask.**
> **Have a look when you're ready. You can change anything on it, or leave [Ellen] to keep running it.**
> *(button: **See what's on the page**)*

⚠️ **THE EXAMPLES ARE DELIBERATELY ABSENT.** **The obvious version of this paragraph lists *"a meal, a lift, the school run"* — which is EXACTLY bug #076, live right now on the activation page, naming the school run on bereavement pages.** ❗ **Do not add examples here. If they're ever wanted, they must be occasion-aware.**
✅ **Follows Kate's 22 August rule: state the arrangement, never the person's ignorance. *"Ellen set this page up for you"* — not *"you may not know about this"*.**

### #071 — deleting a draft

> **Delete this draft?**
> **Nothing has been sent and nobody has seen it. This can't be undone.**
> *(buttons: **Delete** · **Keep it**)*

📌 **Names the real cost, per the P1 rule — what is lost, not merely what changes.**

---

## Paste this into Claude Code

```
The crisis path — /hardest-times. Fresh chat. Read build/BUGS_AND_FIXES.md
entries #025, #070, #071, #072, #073, #074 and PATTERN P1 before touching
anything. The approved copy is in this file; use it verbatim, don't redraft.

STEP 0 — VERIFY BEFORE YOU BUILD. Do not skip this.
#025 says "do not merge PR #58 until fixed". PR #58 merged on 22 August.
Determine which happened. Read the code, not the record:
  - does sendRecipientClaimNotification still only read page.recipientEmail?
  - is it still skipped when that is null?
  - do crisis/organiser pages still have it null?
Tell me plainly whether a task claim on a crisis page notifies ANYONE today.
Show me the evidence. Correct the #025 row either way — its status line still
says "not yet live since unmerged", which is stale on its face.

If it IS live, stop and tell me before building anything else. That outranks
the rest of this list.

THEN, in this order, and stop between each so I can look:

1. #071 — a draft page must be re-openable and deletable.
   (a) re-open and resume where they left off. This is the urgent half.
   (b) delete, with the confirm copy in this brief.
   Kate's dashboard currently carries EIGHT dead drafts, seven named
   "Support for Val" — use them as the test case, don't delete them without
   asking me.
   Read PATTERN P1 first: the warning names what is LOST, not what changes.

2. #070 — fork the crisis setup form: "Who is this for? — You / Someone else".
   If someone else: THEIR name and contact first, then the person setting it
   up. THE FORK ALREADY EXISTS in BuyDetails.tsx (showFork = !isWorkplace,
   with the for-self name read-back). Port it. Do not invent a second pattern.

3. #074 — the texted link must land on an intro, not the management screen.
   Use the copy in this brief. The #035 opener is the model; this is its
   crisis-path sibling, worded for someone who did NOT receive a gift.
   ⚠️ Do NOT add task examples to that paragraph — that is bug #076, live
   right now, naming the school run on bereavement pages.

4. #072 — the PIN screen copy. Verbatim from this brief.

5. #073 — the wait pill must state the duration the calendar already blocks.
   #033 reserves 240 minutes; the tile says nothing. Cheapest honest fix is
   for the pill to state what the calendar will block.

For each: show me the screen rendered at 375px, and for #071 show me the
resume actually resuming — a draft left half-finished, reopened, with the
earlier answers still in it.

Migration first if any of these need one. Stop before merging.
```

---

## 🚩 Risks worth naming before this starts

1. ❗ **#025 is the unknown, and it's the one that would be worst.** **Everything else here is a person struggling with a screen. That one is a person being told nothing while help quietly arrives or doesn't.**
2. ⚠️ **#071's delete must not become a way to lose an ACTIVE page.** **Draft only. If the same control can reach a live page with helpers already committed, that's a far worse bug than the one being fixed.**
3. ⚠️ **Kate's eight dead drafts are real data and the best test case in the product.** **Don't clean them up until they've been used to prove the fix.**
4. 📌 **The FAQ waits for this.** **Publishing it links to `/hardest-times` three times, and Cowork will not recommend promoting a path with these open.**
