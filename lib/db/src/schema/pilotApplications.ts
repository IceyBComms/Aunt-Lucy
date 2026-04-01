import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const orgTypeEnum = pgEnum("org_type", [
  "healthcare",
  "school",
  "community",
  "faith",
  "social_work",
  "other",
]);

export const pilotApplicationsTable = pgTable("pilot_applications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  orgName: text("org_name").notNull(),
  orgType: orgTypeEnum("org_type").notNull(),
  usageDescription: text("usage_description").notNull(),
  hearAboutUs: text("hear_about_us"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
