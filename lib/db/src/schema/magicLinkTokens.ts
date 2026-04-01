import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organisersTable } from "./organisers";

export const magicLinkTokensTable = pgTable("magic_link_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organiserId: text("organiser_id")
    .notNull()
    .references(() => organisersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
