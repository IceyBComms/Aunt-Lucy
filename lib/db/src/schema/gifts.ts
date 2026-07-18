import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";

// Mirrors the wizard's occasion field so warm templates can be chosen at
// purchase time, before the recipient's support page exists.
export const giftOccasionEnum = pgEnum("gift_occasion", [
  "new_baby",
  "illness_recovery",
  "bereavement",
  "ongoing_support",
  "other",
]);

export const giftStatusEnum = pgEnum("gift_status", [
  "pending",
  "paid",
  "delivered",
  "redeemed",
  "refunded",
  "failed",
  "cancelled",
]);

export const giftsTable = pgTable("gifts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // A gift is purchased first and lives on the giver's side. The support page
  // is created only when the recipient redeems, so page_id starts null and is
  // set at redemption. onDelete: "set null" keeps the purchase record intact
  // if the (short-lived) page is later closed or deleted.
  pageId: text("page_id").references(() => supportPagesTable.id, {
    onDelete: "set null",
  }),
  // Unguessable public token the recipient uses to redeem — never expose the id.
  redemptionToken: text("redemption_token").notNull().unique(),
  purchaserName: text("purchaser_name").notNull(),
  purchaserEmail: text("purchaser_email").notNull(),
  recipientName: text("recipient_name").notNull(),
  // Null when the purchaser chooses to deliver the link themselves.
  recipientEmail: text("recipient_email"),
  occasion: giftOccasionEnum("occasion"),
  // The "Gifted by …" present-style note shown on the delivered page.
  giftedByNote: text("gifted_by_note"),
  // Money is stored as integer cents; never floats. Currency is explicit.
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("AUD"),
  status: giftStatusEnum("status").notNull().default("pending"),
  // Provider-agnostic: e.g. "stripe" plus the provider's session/intent id.
  paymentProvider: text("payment_provider"),
  paymentReference: text("payment_reference"),
  // When the buyer asked for the gift to reach the recipient. Set at purchase
  // (defaults to "now"), so it is the *intent*; delivered_at below is the
  // record of what actually happened. Null is treated as "as soon as paid".
  deliverAt: timestamp("deliver_at"),
  // The gift experience page (a read-only keepsake) was sent to the recipient.
  deliveredAt: timestamp("delivered_at"),
  // When the activation reminder email fires. The app defaults this to the due
  // date if provided, otherwise 14 days after purchase.
  remindAt: timestamp("remind_at"),
  // When the recipient activated the gift and set up their support page.
  redeemedAt: timestamp("redeemed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGiftSchema = createInsertSchema(giftsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGift = z.infer<typeof insertGiftSchema>;
export type Gift = typeof giftsTable.$inferSelect;
