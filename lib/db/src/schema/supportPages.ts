import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageStatusEnum = pgEnum("page_status", [
  "draft",
  "pending_approval",
  "active",
  "closed",
]);

export const pagePrivacyEnum = pgEnum("page_privacy", [
  "open",
  "pin_protected",
]);

export const supportPagesTable = pgTable("support_pages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  organiserId: text("organiser_id"),
  recipientName: text("recipient_name").notNull(),
  recipientContact: text("recipient_contact"),
  situationDescription: text("situation_description"),
  location: text("location"),
  // An optional free-text note the recipient writes at activation, shown to
  // every helper on the public page (e.g. "text before you come; naps are
  // 12–2"). Nullable and additive — a page without one renders no card.
  goodToKnow: text("good_to_know"),
  status: pageStatusEnum("status").notNull().default("draft"),
  privacy: pagePrivacyEnum("privacy").notNull().default("open"),
  pin: text("pin"),
  approvalToken: text("approval_token"),
  // Set when a recipient activates their gift but chooses a future go-live
  // date. The page and its slots exist immediately with status 'draft' (so
  // nothing is visible at /s/:slug), and the existing dispatcher flips it to
  // 'active' once this timestamp passes. Null means "went live straight away".
  scheduledActivateAt: timestamp("scheduled_activate_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertSupportPageSchema = createInsertSchema(supportPagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportPage = z.infer<typeof insertSupportPageSchema>;
export type SupportPage = typeof supportPagesTable.$inferSelect;
