/**
 * Who gets told about something that happened on a support page.
 *
 * ── Why this file exists (bug #025) ──────────────────────────────────────────
 * There were two answers to "who hears about this page?" and they disagreed.
 * Item 17 widened `notifyRecipientOfTaskEvent` to reach every active grant
 * holder, so a RELEASED task told the recipient and every manager. But the
 * "someone claimed a task" notice went through an older, batched dispatcher
 * that only ever read `support_pages.recipient_email` — a column the crisis and
 * organiser flows never populate. The result was live for eight days: on a
 * friend-run crisis page, giving a task BACK notified the managers and taking
 * one notified nobody at all.
 *
 * Two halves of the same event went down two code paths and only one got
 * widened. So the resolution now lives in ONE place that both call. If a third
 * notification is ever added, it inherits the same answer for free — and if
 * this rule changes, it cannot change for only half the product.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * ⚠️ NO DATABASE IN THIS FILE, deliberately. The query that feeds it lives in
 * lib/notifyTargetsDb. This bug survived eight days in production because the
 * rule could only be exercised against a live Neon branch; a rule that needs a
 * database to test is a rule that does not get tested.
 *
 * A page's audience is its own `recipient_email` / `recipient_mobile` (the
 * long-standing page-level contact), PLUS every unrevoked grant that carries
 * its own contact — a nominated manager, or the affected person once looped in.
 * Targets are de-duplicated by contact point so nobody is messaged twice when
 * the same address sits on the page and on a grant.
 */
import type { SupportPage } from "@workspace/db";

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type NotifyTarget = {
  mobile: string | null;
  email: string | null;
  /**
   * This person's OWN management token, when they hold a grant.
   *
   * Never share one token across targets. Handing a manager the recipient's
   * token would give her the recipient's private handle on her own page — the
   * grant model exists precisely so one person's link can be revoked without
   * disturbing anyone else's.
   */
  token: string | null;
  /**
   * Is this the person the page is ABOUT, as opposed to someone running it for
   * them? Drives the addressee in the copy: "shown up for you" vs "shown up
   * for Nadia". Getting this wrong tells a sister she is the one being cared
   * for, which is the same fault as bug #039.
   */
  isRecipient: boolean;
  /** Their own name, when we know it — used to greet a manager by name. */
  personName: string | null;
};

/**
 * Everyone who should hear about this page right now.
 *
 * The page-level contact comes first and claims its contact points before any
 * grant does, so the common single-target case resolves exactly as it always
 * has. A gift recipient's self-grant carries no `personContact` (the page is
 * already hers — her contact is the page-level one), so it never duplicates
 * her; its token is still picked up and attached to that page-level target so
 * she gets her own management link rather than a public one.
 */
/** One active grant, as the pure builder below needs it. */
export interface NotifyGrant {
  token: string;
  role: string;
  personName: string | null;
  contact: string | null;
}

/**
 * The rule itself, with no database in it.
 *
 * Kept pure and separate from the query on purpose: WHO gets told is the entire
 * substance of bug #025, and a rule that can only be exercised against a live
 * Neon branch is a rule that goes eight days unverified. The wrapper below does
 * the I/O; this does the thinking, and the tests drive this.
 */
export function buildNotifyTargets(
  page: Pick<SupportPage, "recipientEmail" | "recipientMobile">,
  grants: NotifyGrant[],
): NotifyTarget[] {
  const seen = new Set<string>();
  const targets: NotifyTarget[] = [];

  const pageMobile = page.recipientMobile?.trim() || null;
  const pageEmail = page.recipientEmail?.trim() || null;
  if (pageMobile || pageEmail) {
    if (pageMobile) seen.add(pageMobile);
    if (pageEmail) seen.add(pageEmail);
    targets.push({
      mobile: pageMobile,
      email: pageEmail,
      // The recipient's own self-grant, so her link is her private management
      // page and not the public /s/:slug fallback.
      token: grants.find((g) => g.role === "recipient")?.token ?? null,
      isRecipient: true,
      personName: null,
    });
  }

  for (const g of grants) {
    const contact = g.contact?.trim();
    if (!contact || seen.has(contact)) continue;
    seen.add(contact);
    targets.push({
      mobile: isEmailAddress(contact) ? null : contact,
      email: isEmailAddress(contact) ? contact : null,
      token: g.token,
      isRecipient: g.role === "recipient",
      personName: g.personName?.trim() || null,
    });
  }

  return targets;
}
