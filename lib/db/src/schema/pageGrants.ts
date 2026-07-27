import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";

// What a grant lets someone do. Only "recipient" is minted today; "manager" is
// reserved for the parked co-admin / handover work so the shape is ready but
// nothing acts on it yet.
export const pageGrantRoleEnum = pgEnum("page_grant_role", [
  "recipient",
  "manager",
]);

/**
 * A per-page list of individual management grants — the re-entry mechanism for
 * a recipient who never has an account.
 *
 * Each granted person gets their OWN unguessable token, deliberately NOT a
 * single page-wide token. That is the future-proofing note from the brief: a
 * second manager can be added, the page handed over, or one person's access
 * revoked, all without disturbing anyone else's link. Access is checked by
 * resolving the token to this row (token valid, revoked_at null, page open).
 *
 * The token is private and separate from the public gift keepsake link
 * (/gift/:redemptionToken) and the public support page (/s/:slug). Only the
 * recipient's own grant is created for now; the co-admin/handover UI is parked.
 */
export const pageGrantsTable = pgTable("page_grants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  // 32 random bytes, hex — the private management credential. Never exposed in
  // a public URL and never derived from the slug or redemption token.
  token: text("token").notNull().unique(),
  role: pageGrantRoleEnum("role").notNull().default("recipient"),
  // Who this grant is for. Null for the recipient's own self-grant (the page is
  // already theirs); filled in when a named manager is later added.
  personName: text("person_name"),
  personContact: text("person_contact"),
  // Which grant issued this one — the audit/handover trail. Null for the
  // original recipient grant. Self-referential; kept nullable and unenforced
  // for now since the handover flow that would populate it is parked.
  grantedByGrantId: text("granted_by_grant_id"),
  // Set when access is revoked. A revoked grant's token stops working while
  // every other grant on the page keeps its own link.
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPageGrantSchema = createInsertSchema(pageGrantsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPageGrant = z.infer<typeof insertPageGrantSchema>;
export type PageGrant = typeof pageGrantsTable.$inferSelect;
