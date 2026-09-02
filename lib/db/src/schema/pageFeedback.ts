import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";
import { pageGrantsTable } from "./pageGrants";

/**
 * What the person running a page said about how it actually went.
 *
 * THE ROW IS THE RECORD; the email to Kate is only the notification. That
 * ordering is the whole reason this table exists rather than the cheaper
 * email-only variant: on 2 September a real notification reached nobody and
 * logged nothing (#102), and feedback that vanishes silently is worse than
 * never asking — the person spent their goodwill, nobody read it, and nobody
 * ever finds out. Write here first, then send.
 *
 * PRIVACY. This text will contain real detail about real illnesses and real
 * deaths, written by people at their lowest. It goes to Kate and nowhere else:
 * it is never rendered on any page, public or private, and never quoted as a
 * testimonial anywhere without asking that person first. Do not add a read
 * path to this table that any customer-facing surface can reach.
 *
 * Multiple rows per page are expected and fine — people think of things
 * afterwards, and the form stays reopenable for exactly that reason.
 */
export const pageFeedbackTable = pgTable("page_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  // Which management link it came from, so a page run by two people can tell
  // the recipient's words from her sister's. "Set null" rather than "cascade":
  // losing the attribution is survivable, losing the feedback is not.
  grantId: text("grant_id").references(() => pageGrantsTable.id, {
    onDelete: "set null",
  }),
  // "Did people show up? Tell us how it went." — the outcome question.
  wentWell: text("went_well"),
  // "Anything get in the way?" — the bug question.
  gotInTheWay: text("got_in_the_way"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPageFeedbackSchema = createInsertSchema(pageFeedbackTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPageFeedback = z.infer<typeof insertPageFeedbackSchema>;
export type PageFeedback = typeof pageFeedbackTable.$inferSelect;
