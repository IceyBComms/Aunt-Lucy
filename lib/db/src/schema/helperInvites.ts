import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";
import { slotsTable } from "./slots";
import { contactsTable } from "./contacts";

// Which approved copy an invite renders, and how it reaches the helper.
export const helperInviteKindEnum = pgEnum("helper_invite_kind", [
  // 9a / 9c — general "anyone can help" invite pointing at the whole page.
  "general",
  // 9b — a named person asked about one sensitive, trusted-only task.
  "trusted",
  // 9d — the gentle second-wave nudge when tasks are still open.
  "second_wave",
]);

export const helperInviteChannelEnum = pgEnum("helper_invite_channel", [
  "sms",
  "email",
]);

// The outbox lifecycle. "queued" is claimed by the dispatcher when scheduled_for
// passes; "send now" inserts already past-due and is sent inline. Kept separate
// from gift_messages on purpose — that queue is email-only and gift-scoped.
export const helperInviteStatusEnum = pgEnum("helper_invite_status", [
  "queued",
  "sent",
  "failed",
  "cancelled",
]);

/**
 * One row per outbound invite message to a contact — the generalised successor
 * to trusted_helper_invites, and the invite send outbox in one table.
 *
 * Page-level vs slot-level is the slot_id column: null = a general page invite
 * (link is /s/:slug); set = a trusted invite for that one sensitive slot (link
 * is /invite/:invite_token, which is the grant that lets them claim it). This
 * is how the same table serves both the "anyone can help" and the "one named
 * person, one sensitive task" cases the brief asked for.
 *
 * The wave mechanism lives in status + scheduled_for: "send now" is sent inline
 * and marked sent; "next wave" is inserted queued with a future scheduled_for
 * and picked up by /internal/dispatch-invites on the shared cron.
 */
export const helperInvitesTable = pgTable("helper_invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  // The person invited. Set null (not cascade) so a sent record survives the
  // contact being removed from the list.
  contactId: text("contact_id").references(() => contactsTable.id, {
    onDelete: "set null",
  }),
  // Null for a general/second-wave page invite; set for a trusted slot invite.
  slotId: text("slot_id").references(() => slotsTable.id, {
    onDelete: "cascade",
  }),
  kind: helperInviteKindEnum("kind").notNull(),
  channel: helperInviteChannelEnum("channel").notNull(),
  // Snapshot of who/where at send time, so the record stands alone even if the
  // contact row later changes or is deleted.
  name: text("name").notNull(),
  mobile: text("mobile"),
  email: text("email"),
  // The recipient's optional personal opener, shown above the verbatim Aunt
  // Lucy body. Null when they didn't add one. The signature and opt-out line
  // are always the approved copy and are never stored here.
  personalOpeningLine: text("personal_opening_line"),
  // Present only for trusted slot invites — the unguessable grant token in the
  // /invite/:token link. Null for general invites, which just point at the page.
  inviteToken: text("invite_token").unique(),
  status: helperInviteStatusEnum("status").notNull().default("queued"),
  // When it should send. "Send now" sets this to the send moment; a wave sets a
  // future time. Date/minute granularity matches the ~15-min dispatch cron.
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  failedAt: timestamp("failed_at"),
  // Set when a trusted invite is claimed via its token.
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHelperInviteSchema = createInsertSchema(
  helperInvitesTable,
).omit({ id: true, createdAt: true });
export type InsertHelperInvite = z.infer<typeof insertHelperInviteSchema>;
export type HelperInvite = typeof helperInvitesTable.$inferSelect;
