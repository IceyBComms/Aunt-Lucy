/**
 * Closing a page — the whole decision, with no database, no send and no browser
 * (bug #090).
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS PURE
 * `page_status` has carried a `closed` value since the first migration. Eight
 * places READ it — the public page, the invite link, the management middleware,
 * the notification paths, the invite dispatcher — and NOTHING anywhere wrote it.
 * So the locked principle "the person a page is about must always be able to see
 * everything and shut it down" was half unbuilt, for every page, in every flow.
 *
 * This is the half that was missing. It follows lib/draftDeletion.ts, extracted
 * from its route for #071 for exactly this reason: getting closure WRONG is far
 * worse than the bug it fixes. Closing the wrong page stops help a family is
 * relying on; cancelling the wrong claim tells someone who already cooked that
 * they weren't needed; MISSING a claim leaves a child at school. So the decision
 * is separated from the route that performs it and tested directly — the lesson
 * recorded on #025 is that a rule needing a live Neon branch is a rule that goes
 * unverified.
 *
 * ⚠️ A GREEN SUITE HERE PROVES THE RULE, NEVER THAT THE ROUTE STILL CALLS IT.
 * The wiring is held by the source-reading assertions at the bottom of
 * pageClosure.test.ts. See the note there.
 *
 * KATE'S RULINGS, 20 September 2026 — this file implements them and does not
 * re-open them:
 *   1. ONE BUTTON. Closing stops the page immediately and cancels the live
 *      claims. A second state ("closed to new claims while existing ones run")
 *      was CONSIDERED AND DECLINED — it is close to what you already get by not
 *      adding tasks.
 *   2. ONLY PEOPLE WITH A LIVE, FUTURE CLAIM are cancelled and told.
 *   3. THE CLOSER CHOOSES WHO DOES THE TELLING.
 *   4. The message is a fixed fact from us plus an optional box from them,
 *      attributed to the closer (see lib/pageClosureCopy.ts).
 *   5. It is reversible; reopening restores the PAGE, never the commitments.
 *   7. Any unrevoked grant-holder can close. The recipient can ALWAYS close and
 *      can never be locked out. A helper holds a claim link, never a grant.
 */
import { sydneyDate, sydneyTime } from "./australianDay";
import type { NotifyTarget } from "./notifyTargets";

export const CLOSED_PAGE_STATUS = "closed";

/**
 * What a page falls back to when we have no record of what it was — a page
 * closed before migration 0017 shipped. See restoredStatus below.
 */
export const DEFAULT_REOPENED_STATUS = "active";

/** Every status a page may be RESTORED to. Deliberately excludes "closed". */
export const RESTORABLE_STATUSES = ["draft", "pending_approval", "active"] as const;

export type RestorableStatus = (typeof RESTORABLE_STATUSES)[number];

/** The recipient's grant role — the one that can never be locked out. */
export const RECIPIENT_GRANT_ROLE = "recipient";

// ─── May this person close it? ───────────────────────────────────────────────

/**
 * One grant, as the rule needs it. Deliberately NOT filtered on `revokedAt`
 * before it gets here: the recipient's right to shut their own page down does
 * not depend on somebody else's bookkeeping, so the rule must be able to SEE a
 * revoked recipient grant in order to let it through.
 */
export interface ClosureGrant {
  id: string;
  token: string;
  role: string;
  revokedAt: Date | null;
}

export interface ClosurePage {
  status: string;
}

/** A page as the reopen rule needs it. */
export interface ReopenablePage {
  status: string;
  /** What it was when it was closed. Null on anything closed before 0017. */
  statusBeforeClose: string | null;
}

/**
 * WHAT DOES REOPENING PUT THE PAGE BACK TO?
 *
 * ⚠️ NOT ALWAYS "active", and this is the fault the first cut of closure had.
 * Closing a page that is not yet live is LEGITIMATE and is one of the cases
 * closure exists for — a scheduled gift page whose recipient has died is the
 * example that decided it. But reopening one to 'active' would publish a
 * half-built page that nobody ever chose to make live, skipping the publish
 * guard (lib/pagePublish.ts) entirely. Banning the close would be the wrong
 * fix; remembering what it was is the right one.
 *
 *   • a DRAFT closed and reopened is a draft again — still not live
 *   • a SCHEDULED gift page goes back to scheduled: it is stored as a draft
 *     with scheduled_activate_at set, closure never touches that timestamp,
 *     and the activation cron (which filters on status 'draft') picks it up
 *     again exactly as before
 *   • an ACTIVE page comes back active, which is the common case
 *
 * TWO FALLBACKS, BOTH TO 'active':
 *   • NULL — the page was closed before migration 0017 shipped, so there is no
 *     record. It cannot be backfilled; 'active' is the only sensible guess, and
 *     it is the status such a page almost certainly had, since closing a draft
 *     needs the /manage screen this work also built.
 *   • ANYTHING NOT RESTORABLE — a value the enum has since lost, or 'closed'
 *     itself (which would strand the page shut and make the reopen button a
 *     no-op that looks broken). Never trusted blindly.
 */
export function restoredStatus(
  page: Pick<ReopenablePage, "statusBeforeClose">,
): RestorableStatus {
  const previous = page.statusBeforeClose?.trim();
  if (previous && (RESTORABLE_STATUSES as readonly string[]).includes(previous)) {
    return previous as RestorableStatus;
  }
  return DEFAULT_REOPENED_STATUS;
}

export type ClosureVerdict =
  /** Go ahead. */
  | { ok: true }
  /** Refuse, with the reason to show the person. */
  | { ok: false; status: 401 | 409; error: string };

const NO_LINK = "This management link isn't valid.";
const REVOKED_LINK = "This management link isn't valid or has been turned off.";

/**
 * Is this grant allowed to act on the page at all?
 *
 * RULING 7, and the asymmetry is the whole point. A `manager` grant works while
 * it is unrevoked, exactly like every other /manage route. A `recipient` grant
 * works FULL STOP — revoked or not — because the page is about them and
 * "can never be locked out" has to survive the case where somebody else has
 * been tidying up the access list. A page's own person is never a guest on it.
 */
function grantMayAct(grant: ClosureGrant | null | undefined): ClosureVerdict {
  if (!grant) return { ok: false, status: 401, error: NO_LINK };
  if (grant.role === RECIPIENT_GRANT_ROLE) return { ok: true };
  if (grant.revokedAt) return { ok: false, status: 401, error: REVOKED_LINK };
  return { ok: true };
}

/**
 * MAY THIS PERSON CLOSE IT?
 *
 * Any unrevoked grant on the page, plus the recipient unconditionally. A helper
 * never reaches here: a helper holds a claim link (`cancel_token`), which
 * resolves to a slot and has never resolved to a grant, so there is no shape of
 * input a helper could supply that this function would say yes to.
 *
 * A page that is not yet live CAN be closed, and that is deliberate rather than
 * an oversight: a gift page scheduled to go live next Tuesday, or a draft with
 * invitations held on it, is exactly the thing somebody may want stopped before
 * it starts. Closing it cancels those queued invitations and stops the
 * scheduled-activation cron, both of which already read `closed`.
 */
export function canClosePage(
  grant: ClosureGrant | null | undefined,
  page: ClosurePage | null | undefined,
): ClosureVerdict {
  const mayAct = grantMayAct(grant);
  if (!mayAct.ok) return mayAct;
  if (!page) return { ok: false, status: 401, error: NO_LINK };
  if (page.status === CLOSED_PAGE_STATUS) {
    return { ok: false, status: 409, error: "This page is already closed." };
  }
  return { ok: true };
}

/**
 * MAY THIS PERSON REOPEN IT? Same people, opposite status check. WHAT it is
 * reopened TO is restoredStatus above, not a constant.
 *
 * ⚠️ Reopening restores the PAGE and nothing else. It cannot restore the
 * cancelled claims, and that is structural rather than a promise: closure
 * performs a real release on each one (the claim columns are cleared), so there
 * is no held-aside copy to put back even if someone later wanted to. A helper
 * who was told "this is cancelled" is never silently re-booked. Their tasks
 * return to the list UNCLAIMED and anyone who wants them claims again.
 *
 * Queued INVITATIONS are not restored either. Closing a page stamps them
 * `cancelled` for good (lib/inviteSendRule.ts — long-standing behaviour, left
 * alone), which is consistent: an invitation is a commitment we made to send,
 * and reopening restores the page, never the commitments.
 */
export function canReopenPage(
  grant: ClosureGrant | null | undefined,
  page: ClosurePage | null | undefined,
): ClosureVerdict {
  const mayAct = grantMayAct(grant);
  if (!mayAct.ok) return mayAct;
  if (!page) return { ok: false, status: 401, error: NO_LINK };
  if (page.status !== CLOSED_PAGE_STATUS) {
    return { ok: false, status: 409, error: "This page isn't closed." };
  }
  return { ok: true };
}

// ─── Which claims are cancelled? ─────────────────────────────────────────────

/** A slot, as the cancellation rule needs it. */
export interface ClosureSlot {
  id: string;
  slotType: string;
  customLabel: string | null;
  /** YYYY-MM-DD, or null for an undated offer ("a meal, whenever suits"). */
  slotDate: string | null;
  /** HH:MM or HH:MM:SS, or null. Only ever meaningful beside a date. */
  slotTime: string | null;
  isClaimed: boolean;
  claimedByName: string | null;
  claimedByContact: string | null;
}

/**
 * Has this task UNAMBIGUOUSLY already happened?
 *
 * ⚠️ THE PRODUCT HAS NO COMPLETION STATE. There is no done flag on a slot and
 * no reminder job; `slots` carries `is_claimed`, `claim_cancelled_at` and a
 * NULLABLE `slot_date`, and the claim route never fills that date in. So for an
 * undated task — the encouraged, common case — "did it happen?" is not a
 * question the data can answer, and no amount of care here will make it one.
 *
 * KATE'S RULING, 20 September 2026: SKIP ONLY WHAT IS UNAMBIGUOUSLY IN THE
 * PAST. EVERYTHING ELSE IS CANCELLED AND TOLD.
 *   • dated, and the date (with its time, where it has one) has passed → true
 *   • dated and still ahead → false
 *   • UNDATED → false. Treat as future.
 *   • anything unresolvable → false. Treat as future.
 *
 * Her reasoning, recorded because the asymmetry is not obvious: an undated
 * claim is someone who said "I'll bring a meal sometime". If it has not
 * happened and we say nothing, they turn up with food at a house that has
 * closed its page. If it HAS happened and we tell them anyway, they read that
 * the page has closed and shrug. Mild awkwardness against someone arriving
 * unannounced at a family in crisis — this is #048's "delivery beats dedupe"
 * pointed at a different question. Telling beats silence.
 *
 * A task dated TODAY with no time is NOT past: the day isn't over. A task dated
 * today WITH a time is past once that time has been and gone in Sydney, which
 * is where every date this product prints is already pinned (see australianDay).
 */
export function hasAlreadyHappened(
  slot: Pick<ClosureSlot, "slotDate" | "slotTime">,
  now: Date,
): boolean {
  if (!slot.slotDate) return false;

  const today = sydneyDate(now);
  if (slot.slotDate > today) return false;
  if (slot.slotDate < today) return true;

  // Dated TODAY. Without a clock the day is still running, so it is not past.
  if (!slot.slotTime) return false;
  // Stored times may or may not carry seconds; pad both sides to HH:MM:SS so
  // the lexicographic compare is honest.
  const at = slot.slotTime.length === 5 ? `${slot.slotTime}:00` : slot.slotTime;
  return at < sydneyTime(now);
}

export interface ClosureCancellation {
  /** Claims that are live and still ahead of us. These are released and told. */
  cancelled: ClosureSlot[];
  /** Claims left exactly as they are: the task has already happened. */
  leftAlone: ClosureSlot[];
}

/**
 * WHICH CLAIMS ARE CANCELLED — the ruling that matters.
 *
 * Only claims that are LIVE AND STILL AHEAD OF US: claimed, not already
 * released, and the task has not yet happened.
 *
 *   • NEVER a task that has already happened. Telling someone they are "no
 *     longer needed" for a meal they delivered last Tuesday is wrong.
 *   • NEVER someone who was invited and never claimed. They committed nothing.
 *     Invitations are not in this function's input at all, which is the
 *     strongest form that guarantee can take — there is no row here to reach
 *     them through.
 *
 * "Not already released" needs no separate test: releasing a slot sets
 * `is_claimed` false and clears the claim columns (routes/slots.ts), so a
 * released claim simply is not claimed.
 */
export function closureCancellations(slots: ClosureSlot[], now: Date): ClosureCancellation {
  const cancelled: ClosureSlot[] = [];
  const leftAlone: ClosureSlot[] = [];
  for (const slot of slots) {
    if (!slot.isClaimed) continue;
    if (hasAlreadyHappened(slot, now)) leftAlone.push(slot);
    else cancelled.push(slot);
  }
  return { cancelled, leftAlone };
}

// ─── Who is told? ────────────────────────────────────────────────────────────

/** One helper to message, resolved from a cancelled claim. */
export interface HelperToTell {
  slotId: string;
  contact: string;
  name: string | null;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
}

export interface ClosureAudience {
  /**
   * Exactly the helpers whose claims were cancelled — and empty when the closer
   * chose to tell people themselves. The claims are cancelled either way.
   */
  helpers: HelperToTell[];
  /**
   * The OTHER grant-holders on the page. Told either way, and never the person
   * who just closed it.
   */
  others: NotifyTarget[];
}

/**
 * WHO IS TOLD.
 *
 * `tellHelpers` is ruling 3 — the closer chooses who does the telling. Choosing
 * "I'll tell people myself" changes this list and NOTHING else: the same claims
 * are cancelled, and the other grant-holders are still told. On a page about
 * someone who has died, this message may be the first many helpers hear, and
 * some families want to make those calls themselves.
 *
 * A cancelled claim with no contact on file yields no helper to tell — there is
 * nowhere to send it. The claim is still cancelled.
 *
 * The closer is excluded by TOKEN, not by name or contact. Every target carries
 * the grant token it came from (lib/notifyTargets), including the page-level
 * target, which picks up the recipient's own grant token — so a recipient who
 * closes their own page is excluded through that path just as a manager is
 * through theirs.
 */
export function closureAudience(opts: {
  cancelled: ClosureSlot[];
  targets: NotifyTarget[];
  closerGrantToken: string;
  tellHelpers: boolean;
}): ClosureAudience {
  const helpers: HelperToTell[] = opts.tellHelpers
    ? opts.cancelled.flatMap((slot) => {
        const contact = slot.claimedByContact?.trim();
        if (!contact) return [];
        return [
          {
            slotId: slot.id,
            contact,
            name: slot.claimedByName,
            slotType: slot.slotType,
            customLabel: slot.customLabel,
            slotDate: slot.slotDate,
            slotTime: slot.slotTime,
          },
        ];
      })
    : [];

  return {
    helpers,
    others: opts.targets.filter((t) => t.token !== opts.closerGrantToken),
  };
}
