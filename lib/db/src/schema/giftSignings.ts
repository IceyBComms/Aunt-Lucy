import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giftsTable } from "./gifts";

// Colleague messages left before the gift experience page is delivered — the
// warm notes that make the recipient feel loved.
export const giftSigningsTable = pgTable("gift_signings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  giftId: text("gift_id")
    .notNull()
    .references(() => giftsTable.id, { onDelete: "cascade" }),
  signerName: text("signer_name").notNull(),
  // The 150-character limit is enforced at the app level, not in the DB.
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGiftSigningSchema = createInsertSchema(giftSigningsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGiftSigning = z.infer<typeof insertGiftSigningSchema>;
export type GiftSigning = typeof giftSigningsTable.$inferSelect;
