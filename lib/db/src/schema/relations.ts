import { relations } from "drizzle-orm";
import { supportPagesTable } from "./supportPages";
import { slotsTable } from "./slots";
import { organisersTable } from "./organisers";
import { magicLinkTokensTable } from "./magicLinkTokens";
import { sessionsTable } from "./sessions";
import { contactsTable } from "./contacts";
import { pageGrantsTable } from "./pageGrants";
import { helperInvitesTable } from "./helperInvites";
import { giftsTable } from "./gifts";
import { giftMessagesTable } from "./giftMessages";
import { giftSigningsTable } from "./giftSignings";

export const supportPagesRelations = relations(supportPagesTable, ({ many, one }) => ({
  slots: many(slotsTable),
  contacts: many(contactsTable),
  grants: many(pageGrantsTable),
  invites: many(helperInvitesTable),
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
  invites: many(helperInvitesTable),
  giftMessages: many(giftMessagesTable),
}));

export const contactsRelations = relations(contactsTable, ({ one, many }) => ({
  page: one(supportPagesTable, {
    fields: [contactsTable.pageId],
    references: [supportPagesTable.id],
  }),
  invites: many(helperInvitesTable),
}));

export const pageGrantsRelations = relations(pageGrantsTable, ({ one }) => ({
  page: one(supportPagesTable, {
    fields: [pageGrantsTable.pageId],
    references: [supportPagesTable.id],
  }),
}));

export const helperInvitesRelations = relations(helperInvitesTable, ({ one }) => ({
  page: one(supportPagesTable, {
    fields: [helperInvitesTable.pageId],
    references: [supportPagesTable.id],
  }),
  slot: one(slotsTable, {
    fields: [helperInvitesTable.slotId],
    references: [slotsTable.id],
  }),
  contact: one(contactsTable, {
    fields: [helperInvitesTable.contactId],
    references: [contactsTable.id],
  }),
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
