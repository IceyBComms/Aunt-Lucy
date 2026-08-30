/**
 * The database half of "who hears about this page" (bug #025).
 *
 * Split from lib/notifyTargets so the RULE can be tested with no database at
 * all — see the note at the top of that file. This module is only the I/O:
 * fetch the live grants, hand them to the pure builder.
 */
import { contactsTable, db, pageGrantsTable, type SupportPage } from "@workspace/db";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { buildNotifyTargets, type NotifyTarget } from "./notifyTargets";

export async function resolvePageNotifyTargets(
  page: Pick<SupportPage, "id" | "recipientEmail" | "recipientMobile">,
): Promise<NotifyTarget[]> {
  const grants = await db
    .select({
      token: pageGrantsTable.token,
      role: pageGrantsTable.role,
      personName: pageGrantsTable.personName,
      contact: pageGrantsTable.personContact,
    })
    .from(pageGrantsTable)
    .where(and(eq(pageGrantsTable.pageId, page.id), isNull(pageGrantsTable.revokedAt)));

  return buildNotifyTargets(page, grants);
}

/**
 * Is this contact point suppressed? Shared by every page notification. STOP suppression is global by mobile (see
 * routes/optout.ts), and email unsubscribe is effectively per email address, so
 * we match either against any opted-out contact row rather than scoping by page.
 * A contact point that was never added as a contact (a public claimer's own
 * email/number) has no row and is therefore not suppressed — correct: they
 * asked to help through the public door and never opted in to a list to leave.
 */
export async function isContactSuppressed(contactValue: string): Promise<boolean> {
  const trimmed = contactValue.trim();
  if (!trimmed) return true;
  const rows = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(
      and(
        or(eq(contactsTable.mobile, trimmed), eq(contactsTable.email, trimmed)),
        isNotNull(contactsTable.optedOutAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
