# WALKTHROUGH_30AUG.md — Kate's crisis-path walk, findings

**Written by Cowork, Sunday 30 August 2026, evening.** ⚠️ **Written into the REPO at creation, per the courier rule adopted today.**
🥇 **THE FIRST TIME ANYONE HAS WALKED THE ORGANISER PATH END TO END SINCE IT WAS FIXED.** **Kate set up a page as *Fergus* for *Tammy*, added tasks, claimed one as a helper, and rescheduled it.**

---

## 🚨 The two that matter

### #085 — THE SETUP PERSON'S OWN EMAIL CALLS THEM BY THE RECIPIENT'S NAME

**Kate set the page up as FERGUS, for TAMMY. The *"Your Aunt Lucy page — keep this link"* email went to `fergus@vouch.com.au` and opened *"Hi Tammy"*.**

❗ **This is the first email the person running the page ever receives, and it calls them somebody else — specifically, it calls them the person they are worried about.**
⚖️ **SAME FAMILY AS #039 AND TODAY'S #025 ADDRESSEE SWAP: a string written for one audience reaching another. We fixed the claim notification's addressee this afternoon and this email was never in scope.** 📌 **The fix is presumably identical in shape — the organiser is not the recipient, and the greeting must follow the reader, not the page.**
🔎 **Also check the same email's body: *"Here's your page"* is arguably wrong too — it is Tammy's page, Fergus is running it.**

### #084 — A TASK TYPED INTO THE FORM IS LOST IF YOU LEAVE, SILENTLY

**Kate's words: *"I set up dogwalking, went out of the dashboard (no save and come back option obvious) and it wasn't there when I then saved another task for a meal."***

❗ **#071 fixed *\"you can't get back into the draft\"*. It did NOT fix *\"the work you'd done is gone when you get there\"*. From the user's side the problem is unchanged: she was interrupted and lost what she'd entered.**
⚠️ **FIRST QUESTION FOR THE BUILDER, AND IT DECIDES THE SEVERITY:**
- **(a) she left before pressing Continue, so it never persisted** — bad UX, no warning, no autosave, no visible way to save-and-return; or
- **(b) it DID persist and the later meal save overwrote it** — a REGRESSION in what shipped today, and much worse.

📌 **The dashboard screenshot shows *Support for Tammy · 0 slots · Draft*, which points at (a) — but the timing isn't certain, so it must be reproduced, not assumed.**
⚖️ **Either way this is PATTERN P1 again: work lost with no warning and no way back. And it is the exact scenario the crisis path is most likely to produce — someone setting up help for a dying relative, interrupted mid-form.**

---

## 📋 The rest

### #082 — *"Time (optional)"* is not optional
**The field is labelled optional and arrives pre-filled with `06:00 PM`, with no obvious way to clear it.** 📌 **Small, but the label states something the form doesn't honour — and a helper reading a task with a time nobody chose is being told something untrue.**

### #083 — the organiser dashboard is unbranded and cold
**Kate: *"The My Dashboard should be in white and it should have the teacup logo — it's a bit ugly."*** **A flat dark-green slab, no teacup, no warmth.** 📌 **This is the page the person running everything comes back to. Same class as the PIN screen: the words are warm and the frame isn't.**

### #037 — RECONFIRMED, the calendar still fails in Outlook
**Kate claimed a slot, tapped *Add this to your calendar*, and Outlook Classic returned *"Sorry, something went wrong. You may want to try again."*** ✅ **Reconfirmed on production 30 August, on the real path, from the confirmation modal.**

### #086 — the email footer is hard to read
**Kate: *"perhaps the AL info at the bottom of the email could be more readable."*** **The *\"New to Aunt Lucy?\"* block is small and low-contrast.** ⚖️ **It is also the only place an email explains what Aunt Lucy IS to a helper who has never heard of it — so legibility there is a commercial matter, not only a cosmetic one.**

### 🚩 AND ONE KATE DIDN'T FLAG — the same footer names THE SCHOOL RUN
**The claim-confirmation email footer reads *"meals, lifts, the school run"*, on every occasion.** ❗ **That is #076's exact fault on a second surface. #076 covers the activation explainer; this is the email family.** 📌 **Log it against #076 rather than as a new bug — same string, same cause.**

---

## ✅ What worked

- **The draft was re-openable, with *Continue setting up* and *Delete* both present, and Delete quiet rather than red.**
- **The claim flow worked, and the confirmation modal read well.**
- **THE RESCHEDULE WORKED END TO END** — *"Kate will bring a meal closer to 7:00pm now — nothing needed from you."* ✅ **Kate: *"The time change for a meal worked ok."*** 📌 **That is `notifyRecipientOfTaskEvent` doing exactly its job, and it is the half of the notification system that was already correct.**
- **The claim-confirmation email carried What / When / Feeding / Dietary needs / Notes cleanly — the 23 August email work holding up on the real path.**
