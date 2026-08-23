# Aunt Lucy — Repo Audit Findings

**Auditor run:** read-only audit, no commits / merges / edits / new branches.
**Date:** 2026-08-03.
**Repo:** `IceyBComms/Aunt-Lucy`. `git fetch --all --prune` run at start — `origin/main` advanced `b7bc6ef..7e315f1`.
**Analysis baseline:** working tree detached on **`origin/main` = `7e315f1`** (Merge PR #35, Item 9). Cross-branch checks use `git grep`/`git diff` across all `origin/*` refs.

> **Reference-doc caveat.** The docs this audit is asked to test beliefs against — `TRACKER.md`, `build/BUGS_AND_FIXES.md`, `research/COMPETITOR_ANALYSIS.md` — **do not exist in any branch or on disk** (`git log --all`, `git ls-tree` over every ref, and a filesystem `find` all return nothing). `build/` did not exist until this file. So the "beliefs" tested below are taken verbatim from the audit brief's inline quotes, not read from the source docs, and the docs' fuller contents (e.g. bug texts #002–#004) could not be independently read. Everything in the **reality** columns is cited to code/commands actually run.

---

## 1. Branch & PR inventory

`origin/main` tip = `7e315f1`. Typecheck on this tip: **PASSES with zero errors** (`pnpm run typecheck` → all 4 workspace projects "Done", no diagnostics). This directly **corrects** the "~9 pre-existing type errors" belief (see §2).

House-rule check ("flag any branch not based on `main`'s tip"): **every** live remote branch has a merge-base *older* than `main`'s tip — none is rebased onto `7e315f1`. For already-merged branches that's harmless (their commits are in `main`); for the open-PR branches it's the flag.

| Branch (`origin/…`) | PR(s) | Base (PR) | Ahead/Behind main | State | Contents summary |
|---|---|---|---|---|---|
| `homepage-boldcut` | **#36 OPEN** (current) | `main` | 2 / 4 | **Unmerged, not on tip** | Homepage copy/structure "bold cut" only. ⚠️ markets fields that don't exist — see §4. |
| `gitignore-env-sandbox` | **#30 OPEN** | `main` | 1 / 18 | **Unmerged, not on tip** | Adds `.env.sandbox` to `.gitignore`. Small, safe, stale base. |
| `item-4-activate` | **#28 OPEN** | `main` | 1 / 20 | **Unmerged but SUPERSEDED** | Item 4 activate flow — already in `main` via #34. `git diff main` shows the branch is *behind* (still has dropped `trusted_helper_invites`). Stale duplicate. |
| `item-2-purchase` | **#27 OPEN** | `claude/item-3-fulfilment` | 4 / 29 | **Unmerged, SUPERSEDED, double-flag** | Item 2 purchase flow — already in `main` via #34. ⚠️ PR base is *another feature branch*, not `main` (stacked PR). Stale duplicate. |
| `item-3-fulfilment` | **#26 OPEN** | `main` | 1 / 29 | **Unmerged but SUPERSEDED** | Item 3 fulfilment — already in `main` via #34. Stale duplicate. |
| `item-5-6-invites` | (no open PR) | — | 2 / 20 | Superseded | Items 5+6 — in `main` via #34. |
| `item-7-8-claim-notify` | (no open PR) | — | 3 / 20 | Superseded | Items 7+8 — in `main` via #34. |
| `item-7-8-assembled` | #34 **MERGED** | — | 0 / 5 | Merged | The go-live assembly (Items 4–8 + Item 2), now in `main`. |
| `item-9-giftsigning` | #35 **MERGED** | — | 0 / 1 | Merged | Item 9 team-card signing. |
| `for-employers-page`, `homepage-copy-refresh`, `teacup-brand`, `claude-md-restructure`, `claude-dir-gitignore`, `aunt-lucy-gifting-schema-kbxtpy`, `aunt-lucy-strategic-update-i7u07b`, `codebase-audit-gaps-dab131` | #22/#23/#31/#25/#24/#15-18/#14/#1-13 all **MERGED** | — | 0 / N | Merged | Housekeeping, brand, gifting schema, infra — all in `main`. |

**Flag:** PRs **#26, #27, #28** are open but their features are **already merged into `main`** via the assembled branch (#34, merged 2026-07-27). They are stale and should be closed to stop them being re-merged and clobbering later work (#27 additionally re-introduces the dropped `trusted_helper_invites` table). **#27's base is `claude/item-3-fulfilment`, not `main`** — the one true house-rule violation among open PRs.

---

## 2. What `main` actually contains

Belief tested (brief, quoting TRACKER 21–24 July): *"main has Item 3 + housekeeping #22–25 + partial 5/6 slice; Items 4, full 5/6, 7/8 unmerged; ~9 pre-existing type errors."*

**Verdict: the belief is now OUT OF DATE — `main` has moved well past it.** Two merges after that TRACKER snapshot changed everything: **#34 (2026-07-27, "Go-live: Items 4–8 assembled + Item 2 purchase flow")** and **#35 (2026-07-30, Item 9)**. Evidence = `git log origin/main`:

| Build item | Belief (21–24 Jul) | Reality on `main` @ `7e315f1` | Evidence |
|---|---|---|---|
| Item 2 (purchase) | not mentioned / unmerged | **FULLY MERGED** | commit `f0a9304` "Fold in the Item 2 purchase flow"; `routes/gifts.ts` `POST /gifts`, `GET /gift-tiers` present. |
| Item 3 (fulfilment) | merged | **FULLY MERGED** | `routes/stripe.ts`, `lib/giftFulfilment.ts` on `main`. |
| Item 4 (activate) | unmerged | **FULLY MERGED** | commit `e2f6a7a`; `gifts.ts` `/gifts/:token/review` + `/activate`. |
| Item 5/6 (invites/trickle) | partial slice only | **FULLY MERGED** | commit `182c36d`; `routes/invites.ts`, `lib/inviteCopy.ts`, `contacts` + `helper_invites` tables. |
| Item 7/8 (claim + notify) | unmerged | **FULLY MERGED** | commits `fccabd7`,`e9a992f`,`4af3fa9`,`95565a5`; `slots.ts` name-visibility + `internal.ts` claim-notify cron. |
| Item 9 (team-card signing) | (not in belief) | **FULLY MERGED** | commit `216000a`; `routes/giftCards.ts`, `giftSignings` table, migration `0004`. |
| Type errors | "~9 pre-existing" | **ZERO** | `pnpm run typecheck` clean across all projects. |

So `main` is materially **further along** than the belief: it is the full go-live assembly (Items 2–9) plus a clean typecheck.

---

## 3. Table-stakes checklist (from `research/COMPETITOR_ANALYSIS.md`, per brief)

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| a | T-minus-1-day reminder for claimed tasks | **MISSING** | `slots.reminder_sent` column exists (`schema/slots.ts`) but **nothing ever reads/sets it** — no reminder cron. The 4 internal jobs (§6) send gift/invite/claim messages only; none scans claimed slots by date. `git grep reminder_sent` → schema declaration only. |
| b | Helper "can't make it" release that reopens the slot | **MISSING** | `slots.ts` has *only* `POST /slots/:slotId/claim`; no un-claim/release route anywhere (`git grep -E "release\|unclaim\|reopen\|withdraw"` finds only opt-out/notification-stamp helpers). Claim email tells helpers *"just get in touch with the organiser directly"* (`email.ts:121`). Organiser has `DELETE /organiser/slots/:slotId` (deletes the whole slot, unwired in UI) but no un-claim. |
| c | Claimed slot visibly closed to others (dup prevention) | **BUILT** | Backend atomic guard `where(and(eq(id), eq(isClaimed,false)))` → 409 on empty `RETURNING` (`slots.ts:83-94`); invite path mirrors it (`invites.ts:245-265`). UI: `SlotCard` renders claimed slots with no claim button + "Claimed by …" (`SlotCard.tsx:72-122`); 409 → toast "Slot already taken" (`use-rally.ts:46-52`). |
| d | Claim confirmation contents | **PARTIAL (2 of 6)** | `sendClaimConfirmation` (`slots.ts:98`→`email.ts:359`) includes **What / When (single `slotTime`, not a window) / Location (free-text, plain string) / Notes (free-text)**. **Absent:** structured address, **dietary field**, **headcount field**, **map link**, **add-to-calendar (.ics)** — none exist in schema, response, or email. Helper who entered a *phone* gets **no** confirmation at all (email-only; no claim SMS). |
| e | Post-setup schedule editing (add/remove/edit tasks & dates) | **PARTIAL** | Add: `POST /organiser/pages/:pageId/slots` (`organiser.ts:67`). Remove (API only, unwired): `DELETE /organiser/slots/:slotId`. **Edit: none** — no `PATCH`/`PUT` slot route exists (`git grep "router.patch\|router.put" routes/` → giftCards/manage only). To change a task/date you must delete+re-add. Recipient's `Manage.tsx` has **no** task controls (read-only list). |
| f | Page links: unguessable / unlisted / index exposure | **BUILT (entropy) / MISSING (noindex)** | Slugs `/s/:slug`: 62-char alphabet × len 12, `crypto.randomBytes` rejection-sampled (`lib/slug.ts`) ≈ **71.5 bits**. Gift/organiser tokens same (`lib/token.ts`); trusted-invite tokens 192-bit, manage/session tokens 256-bit. Not publicly listed (only listing is `GET /organiser/pages` behind `requireAuth`). **But no `robots.txt` / `noindex` / `X-Robots-Tag` / sitemap anywhere** — privacy rests entirely on slug entropy; a leaked slug (referrer, screenshot, history sync) is fully indexable. |
| g | Mobile-web claim flow | **PARTIAL — flag for phone test** | Claim modal `Dialog` sets `body overflow:hidden` and the panel is `overflow-hidden` with **no `max-h` and no `overflow-y-auto`**, vertically centered (`dialog-framer.tsx:16-46`). The `ClaimDialog` form is tall (name+contact+notes+multiline checkbox card+submit). On a short viewport / once the phone keyboard opens, the **"I've got this" submit button can be pushed off-screen with no scroll** (`ClaimDialog.tsx:162-170`). Also `index.html:5` sets `maximum-scale=1` (pinch-zoom disabled, a11y). **Needs a real-phone test.** |

---

## 4. The five 1-Aug bugs (`build/BUGS_AND_FIXES.md` #002–#006)

`build/BUGS_AND_FIXES.md` is **not in the repo** (see caveat), so #002–#004 texts could not be read; the brief specifies only **#005 = school-pickup time field** and **#006 = meals dietary/headcount**. The central question — *did the parallel session handed #005+#006 ever push anything* — is answerable and the answer is **no.**

- **#005 school-pickup time field:** searched **all** `origin/*` branch tips for `pickup_time|pickupTime|drop_off_time|school.?pickup.?time` in `artifacts/*` + `lib/*` → **zero hits on any branch**. The schema has a generic `slots.slot_time` (`schema/slots.ts`) but no dedicated school-pickup time capture, and it is nullable/optional. **No code addresses this on any branch.**
- **#006 meals dietary / headcount:** searched all branch tips for `dietary|headcount|servings|allergie|how many to…` in `artifacts/*`/`lib/*`. The **only** match is **homepage marketing copy**: `origin/claude/homepage-boldcut … Home.tsx:213 "Meals with the right dietary notes. School pickups with the right…"`. There is **no** dietary or headcount **field** in `schema/slots.ts` or the claim route on any branch (`git grep` over `lib/db/src/*` + `slots.ts` for every branch → empty). **No code addresses this on any branch.**
- **#002–#004:** cannot be assessed against the source doc (absent). No branch contains obvious fixes tied to them beyond what §3/§5/§6 already cover.

**Conclusion:** the parallel session that was handed #005 + #006 **pushed nothing to any remote branch.** ⚠️ Compounding irony: the homepage change now up for merge (**PR #36**) *markets* "Meals with the right dietary notes" and "School pickups with the right [time]" — the exact two capabilities #005/#006 were meant to build and which **do not exist** in the product (only a free-text `notes` field and a generic `slot_time`).

---

## 5. Money path state

- **Price points in code** (`lib/giftPricing.ts` `TIERS`, GST-inclusive cents): `consumer_personal` **$59** (5900, `sellable:true`), `workplace_individual` **$79** (7900, `sellable:true`, `hasCard`), `workplace_5pack` **$329** (32900, `sellable:false`), `workplace_10pack` **$549** (54900, `sellable:false`). **Matches CLAUDE.md pricing exactly.**
- **Pack purchase server-side gated? YES, doubly.** Sale side: `POST /gifts` calls `sellableTier(id)` which returns `undefined` for packs (no `paymentLink`) → **400 "isn't available to buy yet"** (`gifts.ts:126-130`); price is set from `tier.amountCents`, **never from the client** (`gifts.ts` comment + insert). Fulfilment side: the webhook calls `isUnfulfillableTier(amountCents)` (`giftPricing.ts:1047`, `>1 gift`) and **refuses to deliver a pack**, logging `NEEDS MANUAL ACTION` and leaving the gift `pending` rather than silently delivering 1-of-5 (`stripe.ts:728-734`). Both gates real, not comment-only.
- **VIP comp path:** implemented on the **fulfilment side only** — `session.amount_total ?? 0`; `tierByAmount(0)` → `COMPLIMENTARY` tier, still delivers a real gift, and `gst.ts` drops the Tax-Invoice header/GST lines for a $0 supply (`gst.ts:1096`, `isTaxable:false`). There is **no in-app "create $0 gift" endpoint** (except dev-only `POST /dev/gifts`); a comp is done by issuing a 100%-off Stripe coupon against the live consumer link. Works, but undocumented as an operational step.
- **Webhook idempotency fix (`claude/fix-webhook-idempotency-unwrap`): MERGED, not loose.** PR #33 merged 2026-07-25 (`git log`: `7368b92`), and the fix is present on `main`: `isUniqueViolation()` walks the `err.cause` chain up to depth 5 for PG `23505` (`stripe.ts:558-571`) — two-layer idempotency (event ledger insert + gift-status check).
- **Live Stripe links hardcoded in the repo:** `giftPricing.ts:882-885` embeds real `buy.stripe.com` URLs for the two sellable tiers. `resolvePaymentLink()` refuses live links outside `NODE_ENV=production` (a good guard against charging real cards in sandbox), and pack links are deliberately kept out of the repo. Note for §8.
- **Migrations — exist vs believed-applied.** Files present (`lib/db/migrations/`): `0000_item3_4_baseline`, `0001_item5_6_invites` (monolith), `0001a_…_additive`, `0001b_…_drop_legacy`, `0002_item7_8_claim_notify`, `0003_enum_catchup`, `0004_item9_giftsigning`. **Their in-file headers say "REVIEW-ONLY DRAFT / Not applied anywhere / sandbox only"** — but those headers are **stale** (written pre-go-live) and must not be trusted as evidence of prod state per audit rules. Actual prod application is **UNVERIFIED** (cannot touch prod). ⚠️ **`0003_enum_catchup` is the sharp edge:** its own header states prod's `gift_message_type` enum is missing `gift_delivery`/`activation_reminder`, and `main`'s deployed `giftFulfilment.ts` inserts `type:'gift_delivery'` on every paid gift — so **if `0003` was not applied to prod, the first real purchase fails fulfilment with "invalid input value for enum"** (buyer charged, nothing delivered). Whether it was applied is UNVERIFIED from the repo.

---

## 6. The internal cron/dispatcher endpoints

**Surprise: there are FOUR, not three.** All in `routes/internal.ts`, all gated by the same `cronAuthorised()`:

| Endpoint | Documented in brief? | Auth |
|---|---|---|
| `POST /internal/dispatch-scheduled` | yes | `INTERNAL_CRON_SECRET` |
| `POST /internal/dispatch-invites` | yes | `INTERNAL_CRON_SECRET` |
| `POST /internal/dispatch-claim-notifications` | yes | `INTERNAL_CRON_SECRET` |
| **`POST /internal/activate-scheduled-pages`** | **NO — undocumented** | `INTERNAL_CRON_SECRET` |

- **Gate quality (all four):** `cronAuthorised()` reads `process.env.INTERNAL_CRON_SECRET`; **fail-closed** if unset (503 "Dispatcher is not configured", `internal.ts:57-63`); compares the `x-internal-cron-secret` header with a **constant-time** `timingSafeEqual` after a length pre-check (`internal.ts:44-71`). Solid.
- **Undocumented 4th job** `activate-scheduled-pages` flips `draft` pages with a past `scheduled_activate_at` to `active` (the delayed go-live), with a re-check-inside-update guard against double-activation (`internal.ts:243-277`). Also undocumented: `dispatch-scheduled` does a **second job inline** — `autoSealDueCards()` auto-seals forgotten workplace cards at their deadline (`internal.ts:185, 203-229`).

---

## 7. Email / SMS inventory

All email via Resend (`FROM = "Aunt Lucy <noreply@auntlucy.com.au>"`); all SMS via Twilio. `EMAIL_TEMPLATES.md` is referenced in comments but **does not exist** — all copy is inlined. **No stub/placeholder copy in the send path** — every template is finished prose. (One recipient-facing *frontend* screen does carry a placeholder — see §8.)

| Message (file:line) | Ch | Trigger | Audience | State |
|---|---|---|---|---|
| `sendMagicLink` (email.ts:184) | ✉ | `auth.ts` sign-in | organiser/buyer/recipient | real |
| `sendPilotApplicationNotification` (email.ts:274) | ✉ | `pilot.ts` → `ADMIN_EMAIL` | internal | real |
| `sendClaimConfirmation` (email.ts:359) | ✉ | `slots.ts` claim | helper | real |
| `sendHelperInviteEmail` (email.ts:507) | ✉ | `manage.ts`/`invites.ts`/`internal.ts` invite cron | helper | real |
| `sendRecipientClaimNotification` (email.ts:666) | ✉ | `dispatch-claim-notifications` cron | **recipient** | real |
| `sendOrganiserCardShare` (email.ts:822) | ✉ | `giftFulfilment` (webhook) | organiser | real |
| `sendBuyerConfirmation` (email.ts:973) | ✉ | `giftFulfilment` (webhook) | buyer | real + GST receipt |
| `sendGiftDelivery` (email.ts:1052) | ✉ | `giftFulfilment` + `dispatch-scheduled` cron | **recipient** | real |
| `sendActivationReminder` (email.ts:1116) | ✉ | `dispatch-scheduled` cron (+14d) | **recipient** | real |
| `generalInviteSms` / `trustedInviteSms` / `secondWaveSms` (inviteCopy.ts:79/98/115) | ✎ | invite cron / `manage.ts` | helper | real |
| `sendSms` transmit (sms.ts:23) | ✎ | invite paths | helper | real (body composed) |

- **Dead senders (defined, never called):** `sendInviteEmail` (email.ts:398) and `sendInviteSms` (sms.ts:44) — superseded by the `helperInvite`/`inviteCopy` path. Safe to delete.
- **Opt-out:** `POST /twilio/inbound` honours STOP/UNSUBSCRIBE/CANCEL/END/QUIT and suppresses every contact sharing that mobile (`optout.ts:31-45`); `GET /unsubscribe/:contactId` one-click email opt-out (`optout.ts:54`). ⚠️ **`/twilio/inbound` does NOT verify the Twilio signature** — see §8.

**⚠️ Crisis/bereavement wording flags** (context: free crisis path, Item 14, imminent). The three **recipient-facing** emails carry celebratory chrome applied uniformly regardless of occasion:
- `sendRecipientClaimNotification`: subject *"Someone's just shown up for you 💛"* / body *"A little good news — …stepped in"* (email.ts:600-620). "Good news" + 💛 can read as breezy to a grieving/acutely-ill recipient.
- 💛 emoji is baked into **every** invite opener/subject (`inviteCopy.ts:87/107/122/131`), none occasion-aware.
- New-parent copy `SITUATION_LINE_DEFAULTS.new_baby = "just welcomed {poss} new baby"` (inviteCopy.ts:47) sits one enum value away from the crisis flow — the crisis path must never inherit `occasion:new_baby`.
- `sendGiftDelivery` body *"Someone who loves you has set up Aunt Lucy for you"* (email.ts:1009) — assumes a loving giver; may not fit a colleague/estranged-relative crisis gift.
- The bereavement/illness *situation* strings themselves are handled sensitively (`bereavement: "recently lost someone dear to {obj}"`, inviteCopy.ts:49) — the risk is the fixed surrounding chrome, not those lines.

---

## 8. Surprises (things the docs don't mention)

1. **`POST /internal/activate-scheduled-pages`** — the 4th, undocumented cron endpoint (§6).
2. **`autoSealDueCards()`** — a second job piggy-backed inside `dispatch-scheduled` (§6).
3. **`POST /twilio/inbound` is unauthenticated** — no `X-Twilio-Signature` validation anywhere (`git grep` → none). A forged POST with `From=<victim mobile>&Body=STOP` would suppress that number's contacts across all pages. Fails *safe* (only opts people out), but is an abuse vector to silence a page's helpers. 🟡
4. **Known dev route** `POST /api/dev/gifts` (`routes/dev.ts`) — correctly prod-gated (`routes/index.ts` mounts `devRouter` only when `NODE_ENV !== "production"`). Confirmed.
5. **Recipient-facing placeholder copy shipped on `main`:** `GiftActivation.tsx:546` — `{/* PLACEHOLDER copy — Kate to approve … */}` on the activation screen (the single highest-stakes relief-vs-homework screen). Not a send-path stub, but unapproved copy in front of the recipient. 🟡
6. **Hardcoded config-that-should-be-env:** live `buy.stripe.com` payment-link URLs (`giftPricing.ts:882-885`) and a **fallback ABN `"34 327 702 731"` + legal name "Icebreaker Communications"** on tax invoices (`email.ts:867-871`) — if `BUSINESS_ABN`/`BUSINESS_LEGAL_NAME` are unset in prod, invoices silently use these. Verify they're set. 🟡
7. **`slots.reminder_sent` column with no reader/writer** — schema carries it (`schema/slots.ts`) but no reminder job exists (§3a). Dead scaffolding for an unbuilt feature. ⚪
8. **Two dead sender functions** (`sendInviteEmail`, `sendInviteSms`) — §7. ⚪
9. **`TODO(pack-links)` / `TODO(multi-gift)`** in `giftPricing.ts:70,217` — explicit unfinished-behaviour markers: packs must not be sold/fulfilled until Item 12. Backed by real guards (§5), so documented-and-defended, not silent. ⚪
10. **Stale migration headers** claiming "not applied anywhere" while go-live notes say otherwise — trust neither header nor memory for prod state; it's UNVERIFIED (§5). 🟡

---

## 9. Verdict table

| Belief (from docs/brief) | Reality (from code) | Severity |
|---|---|---|
| "~9 pre-existing type errors" on `main` | `pnpm run typecheck` **clean, zero errors** | ⚪ (belief stale, good news) |
| `main` ≈ Item 3 + housekeeping; Items 4/5-6/7-8 unmerged | `main` has **Items 2–9 fully merged** (#34, #35) | 🟡 (TRACKER badly out of date — reconcile) |
| Bug #005 (school-pickup time) being handled by parallel session | **No code on any branch**; nothing pushed | 🔴 |
| Bug #006 (meals dietary/headcount) being handled | **No field on any branch**; only homepage *markets* it | 🔴 |
| Homepage (PR #36) copy reflects product | Promises "dietary notes" + "school pickups with the right [time]" the product **can't deliver** | 🔴 launch-blocking (misrepresentation on the page being merged) |
| Claim flow works for helpers (zero-friction, mobile) | Claim modal has **no scroll**; submit can be pushed off-screen on a phone (needs phone test) | 🔴 (core mechanic, primary device) |
| Helpers can release a slot they can't make | **No un-claim route** anywhere; only "contact the organiser" | 🟡 |
| Organiser can edit the schedule after setup | Add + (unwired) delete only; **no edit** of any task/date | 🟡 |
| T-1-day reminders exist | **Missing**; `reminder_sent` column is dead scaffolding | 🟡 |
| Pages are private | 71.5-bit slugs ✓ but **no robots/noindex** — leaked slug is indexable | 🟡 |
| Webhook idempotency "still loose"? | **Merged (#33)** and present on `main` | ⚪ (resolved) |
| Packs can't be over-sold | **Gated server-side twice** (sale + fulfilment) | ⚪ (correct) |
| Prod migrations applied (enum catch-up `0003`) | **UNVERIFIED**; if `0003` unapplied, **first purchase fails fulfilment** | 🔴 if unapplied / 🟡 unverified |
| Only 3 internal cron endpoints | **4** (`activate-scheduled-pages` undocumented) | ⚪ |
| `/twilio/inbound` safe | **Unauthenticated**; forgeable STOP suppresses helpers | 🟡 |
| Recipient activation copy final | `GiftActivation.tsx:546` **placeholder "Kate to approve"** live on `main` | 🟡 |
| Config externalised | Live Stripe links + fallback ABN **hardcoded** | 🟡 |
| Recipient-facing emails occasion-appropriate | Celebratory 💛 / "good news" chrome applied regardless — jars for crisis/bereavement | 🟡 (blocks Item 14 crisis path until fixed) |

---

*End of audit. No commits, merges, edits, or branches were made. This file is the only write. Working tree was left restored to `claude/homepage-boldcut`.*
