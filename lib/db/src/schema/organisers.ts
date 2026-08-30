import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const organisersTable = pgTable("organisers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  /**
   * The setup person's first name (migration 0014).
   *
   * NULLABLE AND STAYS THAT WAY. Every organiser created before 0014 has none,
   * and there is nowhere honest to get one from, so every reader must handle
   * null rather than assume a name exists. New signups collect it as a required
   * field; #074's who-set-it-up line falls back to its no-name wording.
   */
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Organiser = typeof organisersTable.$inferSelect;
