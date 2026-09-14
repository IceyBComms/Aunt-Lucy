/**
 * May this invite go out NOW?
 *
 * ✅ KATE'S RULING, 14 Sep 2026: invitations are HELD until the page is
 * published. Nothing leaves a draft.
 *
 * Why this exists. On 14 Sep Kate added a helper to an invitation-only child
 * care task on step 2 of setup, and the organiser invite route texted them on
 * the spot — from a page that had never been published, while the screen she
 * was looking at said "Nothing has been sent yet." The route inserted the row
 * as `queued` and then sent it inline without ever asking what state the page
 * was in. The dispatcher had the same hole: it cancelled invites on a CLOSED
 * page and sent everything else, drafts included.
 *
 * Pure on purpose, in the shape of `canPublish` (lib/pagePublish.ts): no
 * database, no sender, no clock unless you pass one. Both places that can put
 * an invite on the wire — the inline send (routes/invites.ts, routes/manage.ts,
 * via `placeInvite`) and the wave dispatcher (routes/internal.ts) — decide
 * through this one function, so the rule cannot drift between them.
 */

/**
 * The ONE page status an invite may be sent from. An allow-list, not "not a
 * draft": `pending_approval` is not live either, and a status added to the
 * enum later must hold by default rather than send by default.
 */
export const LIVE_PAGE_STATUS = "active";

/**
 * Page statuses whose verdict is FINAL — the invite either goes (active) or is
 * cancelled for good (closed). The dispatcher only claims invites on these
 * pages. Everything else is held: claiming a held invite into `sending` every
 * fifteen minutes only to put it back would be churn, a crash window that
 * strands a draft's invite in `sending`, and a way for a draft with many
 * invites to fill the batch and starve live pages behind it.
 */
export const SETTLED_PAGE_STATUSES = ["active", "closed"] as const;

export interface InviteablePage {
  status: string;
}

export interface InviteToSend {
  /** When the invite is due. "Send now" and step 2 set this to the insert time. */
  scheduledFor: Date;
  /** The contact has opted out since the invite was made. Always false for the
   *  organiser route, which invites a typed name and number, not a contact. */
  contactOptedOut: boolean;
}

export type InviteHoldReason = "page_not_live" | "not_due";
export type InviteCancelReason = "page_missing" | "page_closed" | "contact_opted_out";

export type InviteSendVerdict =
  /** Put it on the wire. */
  | { send: true }
  /** Not yet. Leave the row `queued`; a later dispatcher run asks again. */
  | { send: false; outcome: "hold"; reason: InviteHoldReason }
  /** Never. Stamp it `cancelled`. */
  | { send: false; outcome: "cancel"; reason: InviteCancelReason };

export function canSendInvite(
  page: InviteablePage | null | undefined,
  invite: InviteToSend,
  now: Date = new Date(),
): InviteSendVerdict {
  // 1. Final refusals first. These were the dispatcher's existing cancellations
  //    and are unchanged: a page that is gone or closed, or a person who has
  //    said no, will not become sendable by waiting.
  if (!page) return { send: false, outcome: "cancel", reason: "page_missing" };
  if (page.status === "closed") return { send: false, outcome: "cancel", reason: "page_closed" };
  if (invite.contactOptedOut) return { send: false, outcome: "cancel", reason: "contact_opted_out" };

  // 2. THE RULING. Anything that is not live is held — not cancelled, because
  //    publishing is exactly what should release it.
  if (page.status !== LIVE_PAGE_STATUS) {
    return { send: false, outcome: "hold", reason: "page_not_live" };
  }

  // 3. A scheduled wave that isn't due yet. The dispatcher's claim query already
  //    filters on this; it is here too so the rule is whole on its own.
  if (invite.scheduledFor.getTime() > now.getTime()) {
    return { send: false, outcome: "hold", reason: "not_due" };
  }

  return { send: true };
}
