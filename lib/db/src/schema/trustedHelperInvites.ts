import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { slotsTable } from "./slots";

export const trustedHelperInvitesTable = pgTable("trusted_helper_invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slotId: text("slot_id")
    .notNull()
    .references(() => slotsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  smsSentAt: timestamp("sms_sent_at"),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TrustedHelperInvite = typeof trustedHelperInvitesTable.$inferSelect;
