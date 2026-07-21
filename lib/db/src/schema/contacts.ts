import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";

/**
 * The recipient's people — "who are your people?" — gathered a few at a time,
 * type-first (import-from-phone is parked). One row per person per page.
 *
 * This is the single foundational list CLAUDE.md describes: it underpins the
 * trust tag, the trickle/wave sends and (later) ambient presence. A contact is
 * not a helper account — helpers never authenticate. It is simply a name and a
 * way to reach them, plus an opt-out flag that must genuinely suppress sends.
 */
export const contactsTable = pgTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  // Stored whole; the copy layer derives a first name the same way the gift
  // emails already do.
  name: text("name").notNull(),
  // At least one of mobile/email is required (enforced in the route, not the
  // column, since either alone is valid). Mobile is stored E.164 so an inbound
  // STOP can be matched back to the contact for suppression.
  mobile: text("mobile"),
  email: text("email"),
  // The light trust tag — a handful of people the recipient marks as able to
  // take on sensitive tasks (minding kids, school pickup). Default false: trust
  // is the exception added on top of a safe default, never the starting point.
  trusted: boolean("trusted").notNull().default(false),
  // Set when the contact opts out (SMS STOP or email unsubscribe). Every wave
  // send checks this is null first — this is what makes "STOP genuinely
  // suppresses" true rather than cosmetic.
  optedOutAt: timestamp("opted_out_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
