import type { Request, Response, NextFunction } from "express";
import { db, pageGrantsTable, supportPagesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Token-gated access for a recipient (or, later, a nominated manager) who has
 * no account. The unguessable per-grant token in the /manage/:token URL is the
 * credential — exactly the "link is not the lock" model the gift activation
 * flow already uses, and the reason support_pages.organiser_id can be null.
 *
 * A grant grants access only while it is not revoked and its page is not closed.
 * Because grants are per-person, revoking one leaves every other manager's link
 * working.
 */
export interface ManagementRequest extends Request {
  grantId: string;
  pageId: string;
  grantRole: "recipient" | "manager";
}

export async function requireManagementToken(
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

  if (row.page.status === "closed") {
    res.status(410).json({ error: "This page has been closed." });
    return;
  }

  (req as ManagementRequest).grantId = row.grant.id;
  (req as ManagementRequest).pageId = row.page.id;
  (req as ManagementRequest).grantRole = row.grant.role as "recipient" | "manager";
  next();
}
