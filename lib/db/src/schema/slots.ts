import { pgTable, text, timestamp, boolean, date, time, integer, pgEnum } from "drizzle-orm/pg-core";
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
  // Meal-specific, both nullable. A meal slot with no dietary notes and no
  // headcount is a perfectly valid flexible offer — these are encouraged, never
  // required, so a recipient or organiser in a hurry is never blocked (bug #006).
  // Left null on every non-meal slot type; only the meal setup UI collects them.
  //   • dietaryNotes — free text: allergies, "vegetarian household", etc. A
  //     helper cooking blind is exactly the problem this removes.
  //   • headcount — how many people the meal needs to feed.
  dietaryNotes: text("dietary_notes"),
  headcount: integer("headcount"),
  trustedHelpersOnly: boolean("trusted_helpers_only").notNull().default(false),
  isClaimed: boolean("is_claimed").notNull().default(false),
  claimedByName: text("claimed_by_name"),
  claimedByContact: text("claimed_by_contact"),
  claimedNote: text("claimed_note"),
  // When the slot was claimed. Drives the batched recipient notification (which
  // claims are new) and the "when" shown on /manage. Null for claims made before
  // this column existed — see the backfill in migration 0002.
  claimedAt: timestamp("claimed_at"),
  // The helper's opt-in choice at claim time. Default false: a helper's name is
  // shown on the public /s/ page ONLY if they ticked "show my name". The
  // recipient always sees the name on /manage regardless — that read is never
  // gated by this flag. See CLAUDE.md "Helper visibility — presence vs names".
  claimedNameVisible: boolean("claimed_name_visible").notNull().default(false),
  // Set by the claim-notification dispatcher once this claim has been included
  // in a batch to the recipient, so it is never notified twice. Backfilled to
  // now() for pre-existing claims so they are treated as already-notified.
  recipientNotifiedAt: timestamp("recipient_notified_at"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSlotSchema = createInsertSchema(slotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Slot = typeof slotsTable.$inferSelect;
