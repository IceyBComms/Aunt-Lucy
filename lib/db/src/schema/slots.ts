import { pgTable, text, timestamp, boolean, date, time, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";

export const slotTypeEnum = pgEnum("slot_type", [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
]);

export const slotsTable = pgTable("slots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  slotType: slotTypeEnum("slot_type").notNull(),
  customLabel: text("custom_label"),
  // Nullable on purpose: a slot with no date is a flexible offer ("a meal,
  // whenever suits") rather than an appointment. The date is filled in when a
  // helper claims it. Most tasks a recipient keeps at activation are undated —
  // asking someone recovering from birth or a bereavement to build a calendar
  // is the homework this product exists to remove.
  slotDate: date("slot_date"),
  slotTime: time("slot_time"),
  notes: text("notes"),
  trustedHelpersOnly: boolean("trusted_helpers_only").notNull().default(false),
  isClaimed: boolean("is_claimed").notNull().default(false),
  claimedByName: text("claimed_by_name"),
  claimedByContact: text("claimed_by_contact"),
  claimedNote: text("claimed_note"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSlotSchema = createInsertSchema(slotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Slot = typeof slotsTable.$inferSelect;
