import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organisersTable } from "./organisers";

export const sessionsTable = pgTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organiserId: text("organiser_id")
    .notNull()
    .references(() => organisersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
