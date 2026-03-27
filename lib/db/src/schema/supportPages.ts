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
  status: pageStatusEnum("status").notNull().default("draft"),
  privacy: pagePrivacyEnum("privacy").notNull().default("open"),
  pin: text("pin"),
  approvalToken: text("approval_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertSupportPageSchema = createInsertSchema(supportPagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportPage = z.infer<typeof insertSupportPageSchema>;
export type SupportPage = typeof supportPagesTable.$inferSelect;
