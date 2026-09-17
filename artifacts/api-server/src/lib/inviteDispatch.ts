/**
 * The per-invite send loop for /internal/dispatch-invites (bug #048).
 *
 * WHY THIS IS A SEPARATE FILE
 * The loop used to live inline in routes/internal.ts with no try/catch in it,
 * which meant a single unexpected throw — a Resend timeout, a network blip, a
 * renderer refusing a malformed body (#046), a DB hiccup on the page lookup —
 * abandoned every invite behind it. Because the batch was claimed by flipping
 * queued → SENT up front, those abandoned rows stayed marked "sent" for ever:
 * nothing to retry from, nothing to alert on, and a helper who was never asked.
 *
 * Pulling the loop out here is what makes that behaviour testable. The route
 * supplies real database writes and real senders; the tests supply fakes that
 * fail on demand, and assert that the invites behind the failure still go.
 *
 * THE RULING IT IMPLEMENTS — DELIVERY BEATS DEDUPE.
 * A duplicate "please help" text is embarrassing for four seconds. An invite
 * that silently never sends means someone in the thick of it gets less help and
 * nobody ever finds out. Every trade-off in here is resolved that way, and the
 * one place it is NOT — a row left stuck in "sending" after a crash rather than
 * automatically re-queued — is deliberate and recorded on bug #009: stuck is
 * visible, and visible is the prerequisite for a human deciding to resend.
 *
 * THE GUARANTEE
 * One bad invite loses exactly one invite, visibly. Never the remainder of the
 * batch, and never silently.
 */

import { canSendInvite, type InviteablePage, type InviteToSend } from "./inviteSendRule";

/** What actually happened when we tried to put one invite on the wire. */
export type InviteDelivery =
  /** It went. */
  | "sent"
  /** It should not go at all now — page closed, or the contact opted out. */
  | "cancelled"
  /** Not yet — the page is not live (Kate's ruling, 14 Sep 2026). Nothing was
   *  sent; the claim is handed back so a later run can ask again. The claim
   *  query already skips pages that aren't settled, so reaching this means the
   *  query and the rule disagreed — it is the second guard, not the first. */
  | "held"
  /** We tried and it did not go. A sender returning false lands here, and so
   *  does any throw: an invite that might not have sent is treated as one that
   *  did not, because "failed" is recoverable by a human and "sent" is not. */
  | "not_sent";

export interface InviteBatchTally {
  sent: number;
  failed: number;
  cancelled: number;
  /** Handed back to `queued` because the page isn't live. Nothing was sent. */
  held: number;
  /**
   * Rows whose OUTCOME could not be written down — the send was attempted, but
   * the database write that records what happened threw. These are left in
   * "sending" on purpose. Counted separately because "we don't know" is a third
   * answer, and folding it into sent or failed would be inventing one.
   */
  stuck: number;
}

/** Where a failure happened. Only used for logging, but the distinction is the
 *  difference between "the message didn't go" and "the message may well have
 *  gone and we failed to write it down". */
export type InviteFailureStage = "deliver" | "record";

export interface InviteBatchHandlers<TInvite> {
  /** Render and send one invite. May throw; a throw is treated as "not_sent". */
  deliver(invite: TInvite): Promise<InviteDelivery>;
  markSent(invite: TInvite): Promise<void>;
  markFailed(invite: TInvite): Promise<void>;
  markCancelled(invite: TInvite): Promise<void>;
  /** Give the claim back: `sending` → `queued`, with nothing stamped. */
  markHeld(invite: TInvite): Promise<void>;
  onError(err: unknown, invite: TInvite, stage: InviteFailureStage): void;
}

/**
 * Walks a claimed batch, sending each invite and recording its own outcome.
 *
 * Every invite is wrapped twice: once around the send, once around the write
 * that records the result. Nothing thrown from either escapes into the loop, so
 * the batch always runs to the end.
 *
 * Callers must have already claimed these rows into "sending" — this function
 * only ever moves a row OUT of that state.
 */
export async function runInviteBatch<TInvite>(
  invites: readonly TInvite[],
  handlers: InviteBatchHandlers<TInvite>,
): Promise<InviteBatchTally> {
  const tally: InviteBatchTally = { sent: 0, failed: 0, cancelled: 0, held: 0, stuck: 0 };

  for (const invite of invites) {
    // 1. Try to send. A returned false and a thrown error mean the same thing
    //    to us, and both cost exactly this one invite.
    let delivery: InviteDelivery;
    try {
      delivery = await handlers.deliver(invite);
    } catch (err) {
      handlers.onError(err, invite, "deliver");
      delivery = "not_sent";
    }

    // 2. Write down what happened. If THIS throws we cannot honestly claim
    //    either outcome, so the row keeps its "sending" claim and shows up in
    //    the stuck count — unfinished and findable, rather than a confident
    //    lie in either direction.
    try {
      if (delivery === "sent") {
        await handlers.markSent(invite);
        tally.sent += 1;
      } else if (delivery === "cancelled") {
        await handlers.markCancelled(invite);
        tally.cancelled += 1;
      } else if (delivery === "held") {
        await handlers.markHeld(invite);
        tally.held += 1;
      } else {
        await handlers.markFailed(invite);
        tally.failed += 1;
      }
    } catch (err) {
      handlers.onError(err, invite, "record");
      tally.stuck += 1;
    }
  }

  return tally;
}

/** Where a freshly made invite ended up. */
export type PlacedInviteStatus = "queued" | "sent" | "failed";

export interface PlaceInviteHandlers<TRow> {
  /** Write the row as `queued`. Always happens, whatever the verdict. */
  insertQueued(): Promise<TRow>;
  /** Render and send it. Only called when the rule says so. */
  send(row: TRow): Promise<boolean>;
  markSent(row: TRow): Promise<void>;
  markFailed(row: TRow): Promise<void>;
}

/**
 * Make one invite, and send it inline only if the page is live.
 *
 * The inline "send now" paths — step 2's trusted helpers (routes/invites.ts)
 * and /manage's Send now (routes/manage.ts) — both come through here. Until
 * 14 Sep 2026 each inserted the row and sent it unconditionally, which is how a
 * draft page texted a child care helper before it was ever published.
 *
 * The row is ALWAYS written. When the page isn't live it is left `queued`, and
 * the dispatcher sends it on its first run after the page goes live — so
 * publishing needs to do nothing at all. Every other non-send verdict (a
 * closed page, an opted-out contact) is also left queued for the dispatcher,
 * which settles it through the same rule: one place stamps `cancelled`, not
 * three.
 */
export async function placeInvite<TRow>(
  page: InviteablePage,
  invite: InviteToSend,
  handlers: PlaceInviteHandlers<TRow>,
  now: Date = new Date(),
): Promise<{ row: TRow; status: PlacedInviteStatus }> {
  const row = await handlers.insertQueued();

  if (!canSendInvite(page, invite, now).send) {
    return { row, status: "queued" };
  }

  // The row is already written, so a throw here would leave it `queued` with
  // the throw escaping to the route — a 500 on an action that half-succeeded,
  // and no record that the send was the part that broke. Treated as a failed
  // send instead: stamped `failed`, logged by the sender, reported as such, and
  // the same one-invite-lost guarantee runInviteBatch gives the cron (#123).
  let ok = false;
  try {
    ok = await handlers.send(row);
  } catch {
    ok = false;
  }
  if (ok) {
    await handlers.markSent(row);
    return { row, status: "sent" };
  }
  await handlers.markFailed(row);
  return { row, status: "failed" };
}
