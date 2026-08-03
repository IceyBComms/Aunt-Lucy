import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giftsTable } from "./gifts";

/**
 * A note's lifecycle. Notes are never hard-deleted: the organiser can
 * soft-remove one before sending the card (light-touch moderation), which
 * flips it to `removed` so it stops showing on the card and stops counting,
 * while the row survives for audit. There is deliberately no "edit" — a signer
 * gets one submission, no account, no take-backs.
 */
export const giftSigningStatusEnum = pgEnum("gift_signing_status", [
  "visible",
  "removed",
]);

// Colleague notes on a workplace team card, added before it is sealed and
// delivered to the recipient as a keepsake — the warm words that make them feel
// loved. One shared no-account link; a required name (a person or a group like
// "the whole Finance team") and a short message.
export const giftSigningsTable = pgTable("gift_signings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  giftId: text("gift_id")
    .notNull()
    .references(() => giftsTable.id, { onDelete: "cascade" }),
  signerName: text("signer_name").notNull(),
  // The ~500-character limit is enforced at the app level, not in the DB.
  message: text("message").notNull(),
  // Default visible; the organiser's soft-remove sets `removed`. A removed note
  // never appears on the card and is not counted toward the ambient tally or
  // the anti-abuse cap.
  status: giftSigningStatusEnum("status").notNull().default("visible"),
  // Audit trail for a soft-remove; null while visible.
  removedAt: timestamp("removed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGiftSigningSchema = createInsertSchema(giftSigningsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGiftSigning = z.infer<typeof insertGiftSigningSchema>;
export type GiftSigning = typeof giftSigningsTable.$inferSelect;
