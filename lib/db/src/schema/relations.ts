import { relations } from "drizzle-orm";
import { supportPagesTable } from "./supportPages";
import { slotsTable } from "./slots";
import { organisersTable } from "./organisers";
import { magicLinkTokensTable } from "./magicLinkTokens";
import { sessionsTable } from "./sessions";

export const supportPagesRelations = relations(supportPagesTable, ({ many, one }) => ({
  slots: many(slotsTable),
  organiser: one(organisersTable, {
    fields: [supportPagesTable.organiserId],
    references: [organisersTable.id],
  }),
}));

export const slotsRelations = relations(slotsTable, ({ one }) => ({
  page: one(supportPagesTable, {
    fields: [slotsTable.pageId],
    references: [supportPagesTable.id],
  }),
}));

export const organisersRelations = relations(organisersTable, ({ many }) => ({
  pages: many(supportPagesTable),
  magicLinkTokens: many(magicLinkTokensTable),
  sessions: many(sessionsTable),
}));

export const magicLinkTokensRelations = relations(magicLinkTokensTable, ({ one }) => ({
  organiser: one(organisersTable, {
    fields: [magicLinkTokensTable.organiserId],
    references: [organisersTable.id],
  }),
}));

export const sessionsRelations = relations(sessionsTable, ({ one }) => ({
  organiser: one(organisersTable, {
    fields: [sessionsTable.organiserId],
    references: [organisersTable.id],
  }),
}));
