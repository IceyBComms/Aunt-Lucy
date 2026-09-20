import type { Request, Response, NextFunction } from "express";
import { db, pageGrantsTable, supportPagesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { CLOSED_PAGE_STATUS } from "../lib/pageClosure";

/**
 * Token-gated access for a recipient (or, later, a nominated manager) who has
 * no account. The unguessable per-grant token in the /manage/:token URL is the
 * credential — exactly the "link is not the lock" model the gift activation
 * flow already uses, and the reason support_pages.organiser_id can be null.
 *
 * A grant grants access only while it is not revoked and its page is not closed.
 * Because grants are per-person, revoking one leaves every other manager's link
 * working.
 *
 * ── THE CLOSED-PAGE FREEZE (bug #090) ────────────────────────────────────────
 * The 410 below is what makes a closed page STOP. Every mutating /manage route
 * — editing a task, adding a contact, sending invitations, handing someone
 * access — inherits it for free and refuses without needing its own check, and
 * that is worth keeping rather than unpicking.
 *
 * Exactly two things must still work on a closed page, or closure is a one-way
 * door: seeing that it is closed, and reopening it. Those routes use
 * `allowClosed` below. Kate's ruling, 20 September 2026: allowing the read
 * through does NOT mean the full management screen renders — GET /manage
 * answers a REDUCED payload for a closed page (it is closed, when, and the
 * reopen button), and no tasks, contacts or invite copy leave the server.
 *
 * ⚠️ Reopening does NOT go through this middleware at all. It cannot: a
 * recipient must never be locked out of their own page, so the close/reopen
 * routes resolve the token themselves WITHOUT the revoked filter below and hand
 * the result to canClosePage / canReopenPage (lib/pageClosure.ts).
 */
export interface ManagementRequest extends Request {
  grantId: string;
  pageId: string;
  grantRole: "recipient" | "manager";
  /** True when this page is closed. Only ever true on an `allowClosed` route. */
  pageClosed: boolean;
}

interface ManagementTokenOptions {
  /**
   * Let a CLOSED page through instead of answering 410. The route is then
   * responsible for serving a reduced view — see GET /manage/:token.
   */
  allowClosed?: boolean;
}

function handler(options: ManagementTokenOptions) {
  return async function requireManagementTokenHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = String(req.params.token ?? "");
    if (!token) {
      res.status(401).json({ error: "This management link isn't valid." });
      return;
    }

    const [row] = await db
      .select({ grant: pageGrantsTable, page: supportPagesTable })
      .from(pageGrantsTable)
      .innerJoin(
        supportPagesTable,
        eq(pageGrantsTable.pageId, supportPagesTable.id),
      )
      .where(and(eq(pageGrantsTable.token, token), isNull(pageGrantsTable.revokedAt)))
      .limit(1);

    if (!row) {
      res.status(401).json({ error: "This management link isn't valid or has been turned off." });
      return;
    }

    const closed = row.page.status === CLOSED_PAGE_STATUS;
    if (closed && !options.allowClosed) {
      res.status(410).json({ error: "This page has been closed." });
      return;
    }

    (req as ManagementRequest).grantId = row.grant.id;
    (req as ManagementRequest).pageId = row.page.id;
    (req as ManagementRequest).grantRole = row.grant.role as "recipient" | "manager";
    (req as ManagementRequest).pageClosed = closed;
    next();
  };
}

/** The default: a closed page is frozen and answers 410. */
export const requireManagementToken = handler({});

/** For the two routes a closed page must still serve. */
export const requireManagementTokenAllowingClosed = handler({ allowClosed: true });
