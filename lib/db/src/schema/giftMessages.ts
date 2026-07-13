import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giftsTable } from "./gifts";
import { slotsTable } from "./slots";

export const giftMessageTypeEnum = pgEnum("gift_message_type", [
  "thank_you",
  "helper_reminder",
  "gifted_by",
  "welcome",
  "custom",
]);

export const giftMessageStatusEnum = pgEnum("gift_message_status", [
  "scheduled",
  "sent",
  "failed",
  "cancelled",
]);

// Queue of individual scheduled, personalised emails unlocked by a paid gift:
// automated helper reminders, scheduled thank-you notes and the welcome copy.
export const giftMessagesTable = pgTable("gift_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  giftId: text("gift_id")
    .notNull()
    .references(() => giftsTable.id, { onDelete: "cascade" }),
  // Ties a thank-you or reminder to the specific claimed slot/helper. Null for
  // broadcast messages; "set null" so a sent record survives slot deletion.
  slotId: text("slot_id").references(() => slotsTable.id, {
    onDelete: "set null",
  }),
  type: giftMessageTypeEnum("type").notNull(),
  // Null recipient = broadcast to all helpers on the page.
  toName: text("to_name"),
  toEmail: text("to_email"),
  subject: text("subject"),
  body: text("body").notNull(),
  status: giftMessageStatusEnum("status").notNull().default("scheduled"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGiftMessageSchema = createInsertSchema(giftMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGiftMessage = z.infer<typeof insertGiftMessageSchema>;
export type GiftMessage = typeof giftMessagesTable.$inferSelect;
