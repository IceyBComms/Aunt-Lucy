import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const organisersTable = pgTable("organisers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Organiser = typeof organisersTable.$inferSelect;
