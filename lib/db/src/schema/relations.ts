import { relations } from "drizzle-orm";
import { supportPagesTable } from "./supportPages";
import { slotsTable } from "./slots";
import { organisersTable } from "./organisers";
import { magicLinkTokensTable } from "./magicLinkTokens";
import { sessionsTable } from "./sessions";
import { trustedHelperInvitesTable } from "./trustedHelperInvites";
import { giftsTable } from "./gifts";
import { giftMessagesTable } from "./giftMessages";
import { giftSigningsTable } from "./giftSignings";

export const supportPagesRelations = relations(supportPagesTable, ({ many, one }) => ({
  slots: many(slotsTable),
  organiser: one(organisersTable, {
    fields: [supportPagesTable.organiserId],
    references: [organisersTable.id],
  }),
  // A page may have been created by redeeming a gift (at most one).
  gift: one(giftsTable),
}));

export const slotsRelations = relations(slotsTable, ({ one, many }) => ({
  page: one(supportPagesTable, {
    fields: [slotsTable.pageId],
    references: [supportPagesTable.id],
  }),
  trustedHelperInvites: many(trustedHelperInvitesTable),
  giftMessages: many(giftMessagesTable),
}));

export const giftsRelations = relations(giftsTable, ({ one, many }) => ({
  page: one(supportPagesTable, {
    fields: [giftsTable.pageId],
    references: [supportPagesTable.id],
  }),
  messages: many(giftMessagesTable),
  signings: many(giftSigningsTable),
}));

export const giftMessagesRelations = relations(giftMessagesTable, ({ one }) => ({
  gift: one(giftsTable, {
    fields: [giftMessagesTable.giftId],
    references: [giftsTable.id],
  }),
  slot: one(slotsTable, {
    fields: [giftMessagesTable.slotId],
    references: [slotsTable.id],
  }),
}));

export const giftSigningsRelations = relations(giftSigningsTable, ({ one }) => ({
  gift: one(giftsTable, {
    fields: [giftSigningsTable.giftId],
    references: [giftsTable.id],
  }),
}));

export const trustedHelperInvitesRelations = relations(trustedHelperInvitesTable, ({ one }) => ({
  slot: one(slotsTable, {
    fields: [trustedHelperInvitesTable.slotId],
    references: [slotsTable.id],
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
