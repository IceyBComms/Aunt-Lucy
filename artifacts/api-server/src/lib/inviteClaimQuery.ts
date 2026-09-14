/**
 * The claim that starts every invite send — one atomic UPDATE, queued → sending.
 *
 * Its own module so a test can build it and read its SQL (`.toSQL()`) with no
 * database: it imports nothing but the schema and the send rule. It is used by
 * `sendQueuedInvites` (lib/queuedInviteSender.ts), which both the cron
 * dispatcher and the publish route call.
 */
import { db, helperInvitesTable, supportPagesTable } from "@workspace/db";
import { and, eq, inArray, lte, type SQL } from "drizzle-orm";
import { SETTLED_PAGE_STATUSES } from "./inviteSendRule";

export interface InviteClaimOptions {
  now: Date;
  limit: number;
  /**
   * Only this page's invites. The publish route passes the page it just made
   * live (Kate's ruling, 14 Sep 2026: publishing sends that page's held
   * invitations straight away). The cron passes nothing and takes every page.
   */
  pageId?: string;
}

/**
 * Claim the batch by flipping queued → SENDING. This is the concurrency lock:
 * one atomic update, so a cron run and a publish — or two overlapping cron
 * runs — can never grab the same row, and nobody is invited twice. It is NOT a
 * claim that anything was delivered (bug #048).
 */
export function claimQueuedInvites(opts: InviteClaimOptions) {
  const conditions: SQL[] = [
    eq(helperInvitesTable.status, "queued"),
    lte(helperInvitesTable.scheduledFor, opts.now),
    // Kate's ruling, 14 Sep 2026 — nothing leaves a draft. Only claim invites
    // whose page has a FINAL answer (live → send, closed → cancel). A draft's
    // invites stay queued, untouched. Filtering here, not only in deliver(),
    // stops a draft's held invites filling the batch and starving live pages.
    inArray(supportPagesTable.status, [...SETTLED_PAGE_STATUSES]),
  ];
  if (opts.pageId) conditions.push(eq(helperInvitesTable.pageId, opts.pageId));

  return db
    .update(helperInvitesTable)
    .set({ status: "sending" })
    .where(
      inArray(
        helperInvitesTable.id,
        db
          .select({ id: helperInvitesTable.id })
          .from(helperInvitesTable)
          .innerJoin(supportPagesTable, eq(helperInvitesTable.pageId, supportPagesTable.id))
          .where(and(...conditions))
          .limit(opts.limit),
      ),
    )
    .returning();
}
