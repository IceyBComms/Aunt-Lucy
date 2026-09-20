/**
 * The database and send half of closing a page (bug #090).
 *
 * Split from lib/pageClosure for the reason recorded at the top of that file
 * and on lib/notifyTargets before it: the RULE — who may close, which claims
 * are cancelled, who is told — must be exercisable with no database, because a
 * rule that needs a live Neon branch is a rule that goes unverified. This
 * module is only the I/O. It makes no decisions of its own; every branch in it
 * came from pageClosure.ts or pageClosureCopy.ts.
 */
import {
  db,
  pageGrantsTable,
  slotsTable,
  supportPagesTable,
  type PageGrant,
  type SupportPage,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { notifyHelperOfTaskEvent } from "./item17Notify";
import { resolvePageNotifyTargets } from "./notifyTargetsDb";
import { sendItem17Email } from "./email";
import { sendSms } from "./sms";
import { isEmailAddress } from "./notifyTargets";
import {
  CLOSED_PAGE_STATUS,
  REOPENED_PAGE_STATUS,
  closureAudience,
  closureCancellations,
  type ClosureGrant,
  type ClosureSlot,
} from "./pageClosure";
import {
  closerFirstName,
  grantHolderClosureMessage,
  helperClosureMessage,
  helperClosureSubject,
} from "./pageClosureCopy";

/**
 * Resolve a management token to its grant and page for the closure routes.
 *
 * ⚠️ NO `revoked_at IS NULL` FILTER, AND THAT IS THE POINT. The middleware
 * filters revoked grants out in SQL, which would make "the recipient can never
 * be locked out" unreachable — a revoked recipient grant would 401 before any
 * rule saw it. The revocation check belongs to canClosePage, which knows the
 * recipient is the exception. Closed pages are returned too, so reopening can
 * find its own page.
 */
export async function loadClosureContext(
  token: string,
): Promise<{ grant: PageGrant; page: SupportPage } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ grant: pageGrantsTable, page: supportPagesTable })
    .from(pageGrantsTable)
    .innerJoin(supportPagesTable, eq(pageGrantsTable.pageId, supportPagesTable.id))
    .where(eq(pageGrantsTable.token, token))
    .limit(1);
  return row ?? null;
}

/** A PageGrant in the shape the pure rule wants. */
export function asClosureGrant(grant: PageGrant): ClosureGrant {
  return {
    id: grant.id,
    token: grant.token,
    role: grant.role,
    revokedAt: grant.revokedAt,
  };
}

/** Every slot on a page, in the shape the cancellation rule wants. */
export async function loadClosureSlots(pageId: string): Promise<ClosureSlot[]> {
  const rows = await db.query.slotsTable.findMany({
    where: eq(slotsTable.pageId, pageId),
    orderBy: (s, { asc }) => [asc(s.slotDate), asc(s.slotTime)],
  });
  return rows.map((s) => ({
    id: s.id,
    slotType: s.slotType,
    customLabel: s.customLabel,
    slotDate: s.slotDate,
    slotTime: s.slotTime,
    isClaimed: s.isClaimed,
    claimedByName: s.claimedByName,
    claimedByContact: s.claimedByContact,
  }));
}

/**
 * Release the claims closure cancels — the SAME write the helper's own "can't
 * make it" link performs (routes/slots.ts), reused deliberately rather than
 * re-invented.
 *
 * Because this is a real release and not a soft flag, ruling 5 holds
 * structurally: there is no held-aside copy of these claims, so reopening
 * CANNOT restore them even by mistake. The tasks come back UNCLAIMED and
 * anyone who wants them claims again.
 *
 * It also makes the calendar feed correct for free: those feeds render
 * STATUS:CANCELLED off `is_claimed`, and `calendar_token` survives a release on
 * purpose, so a helper's subscribed calendar removes the event by itself.
 */
async function releaseClaims(slotIds: string[], now: Date): Promise<void> {
  if (slotIds.length === 0) return;
  await db
    .update(slotsTable)
    .set({
      isClaimed: false,
      // Snapshot the outgoing claim for the record (the RHS reads the pre-update
      // row, so this copies the current claim atomically within the UPDATE).
      cancelledClaimName: sql`${slotsTable.claimedByName}`,
      cancelledClaimContact: sql`${slotsTable.claimedByContact}`,
      claimCancelledAt: now,
      // Clear the live claim so a reopened page leaks nothing about who helped.
      claimedByName: null,
      claimedByContact: null,
      claimedNote: null,
      claimedAt: null,
      claimedNameVisible: false,
      recipientNotifiedAt: null,
      reminderSent: false,
      // Consume the handle: their release link is spent.
      cancelToken: null,
    })
    .where(and(inArray(slotsTable.id, slotIds), eq(slotsTable.isClaimed, true)));
}

export interface ClosureOutcome {
  /** How many live, future claims were cancelled. */
  cancelled: number;
  /** How many helpers were actually messaged. */
  helpersTold: number;
  /** How many other grant-holders were messaged. */
  othersTold: number;
}

/**
 * Close the page: stop it, cancel the live future claims, then tell people.
 *
 * ⚠️ THE ORDER IS THE DESIGN, and it is Kate's 22 August ruling — it stops
 * IMMEDIATELY, and only then is anybody told. The status flips first, so a
 * helper who opens the page a second after reading the message finds it closed
 * rather than still taking claims. The sends are last and every one of them is
 * swallowed on failure: a Twilio hiccup must not leave a page half-closed.
 *
 * ⚠️ THE FREE-TEXT NOTE IS NEVER STORED. It is rendered into the outgoing
 * messages and then discarded — there is no column for it, deliberately (the
 * only schema change in this work is `closed_at`). It will collect sensitive
 * detail ("Tammy passed away on Friday"), and the safest place for that is
 * nowhere. It does still reach Resend and Twilio, which is a real residue and
 * is recorded in the bug row rather than hidden here.
 */
export async function performClosure(opts: {
  page: SupportPage;
  grant: PageGrant;
  slots: ClosureSlot[];
  /** Ruling 3 — false means "I'll tell people myself". */
  tellHelpers: boolean;
  /** Ruling 4(b) — the optional box. Null/blank means nothing was added. */
  note: string | null;
  now?: Date;
}): Promise<ClosureOutcome> {
  const now = opts.now ?? new Date();
  const { cancelled } = closureCancellations(opts.slots, now);

  // 1. STOP IT. Before anything is cancelled and before anyone is told.
  await db
    .update(supportPagesTable)
    .set({ status: CLOSED_PAGE_STATUS, closedAt: now })
    .where(eq(supportPagesTable.id, opts.page.id));

  // 2. Cancel the claims. This happens whichever way ruling 3 went.
  await releaseClaims(
    cancelled.map((s) => s.id),
    now,
  );

  // 3. Tell people. Targets are resolved AFTER the close so a grant revoked in
  //    the same breath is honoured.
  const targets = await resolvePageNotifyTargets(opts.page);
  const audience = closureAudience({
    cancelled,
    targets,
    closerGrantToken: opts.grant.token,
    tellHelpers: opts.tellHelpers,
  });

  const closerFirst = closerFirstName(opts.grant, opts.page.recipientName);

  for (const helper of audience.helpers) {
    void notifyHelperOfTaskEvent({
      helperContact: helper.contact,
      emailSubject: helperClosureSubject(opts.page.recipientName),
      body: helperClosureMessage({
        helperName: helper.name,
        recipientName: opts.page.recipientName,
        closerFirst,
        slotType: helper.slotType,
        customLabel: helper.customLabel,
        slotDate: helper.slotDate,
        slotTime: helper.slotTime,
        occasion: opts.page.occasion ?? null,
        note: opts.note,
      }),
      // No link and no button: the page this would point at is closed and
      // answers 404. See the note in pageClosureCopy.ts.
      link: null,
    });
  }

  const message = grantHolderClosureMessage({
    recipientName: opts.page.recipientName,
    closerFirst,
    helpersTold: audience.helpers.length,
    tellHelpers: opts.tellHelpers,
  });
  for (const target of audience.others) {
    const contact = target.email ?? target.mobile;
    if (!contact) continue;
    void (async () => {
      try {
        if (isEmailAddress(contact)) {
          await sendItem17Email({ to: contact, subject: message.subject, body: message.body });
        } else {
          await sendSms({ to: contact, body: message.body, label: "pageClosure:grantHolder" });
        }
      } catch (err) {
        // safeError, not { err }: a provider's error object carries the message
        // body and its own credentials (see lib/notifyOutcome).
        logger.error(
          { pageId: opts.page.id, err: (err as Error)?.message },
          "Page closure: telling a grant-holder failed",
        );
      }
    })();
  }

  logger.info(
    {
      pageId: opts.page.id,
      cancelled: cancelled.length,
      helpersTold: audience.helpers.length,
      othersTold: audience.others.length,
      tellHelpers: opts.tellHelpers,
      noteAdded: !!opts.note?.trim(),
    },
    "Page closed",
  );

  return {
    cancelled: cancelled.length,
    helpersTold: audience.helpers.length,
    othersTold: audience.others.length,
  };
}

/**
 * Reopen: the page comes back, the commitments do not.
 *
 * Sets the status and clears nothing else — `closed_at` deliberately stays, as
 * the record that it happened. Nothing here touches slots, so the cancelled
 * claims cannot return; nothing here touches helper_invites, so invitations
 * cancelled at closure stay cancelled. Both are ruling 5, and the reopen screen
 * says so rather than leaving whoever reopens to discover it.
 */
export async function performReopen(page: SupportPage): Promise<void> {
  await db
    .update(supportPagesTable)
    .set({ status: REOPENED_PAGE_STATUS })
    .where(eq(supportPagesTable.id, page.id));
  logger.info({ pageId: page.id }, "Page reopened");
}
