import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giftOccasionEnum } from "./enums";

export const pageStatusEnum = pgEnum("page_status", [
  "draft",
  "pending_approval",
  "active",
  "closed",
]);

export const pagePrivacyEnum = pgEnum("page_privacy", [
  "open",
  "pin_protected",
]);

// How the recipient is referred to in the warm invite copy sent to helpers.
// Defaults to they/them so nothing is ever assumed; the recipient sets this at
// activation. A name-only fallback is handled in the copy layer, not here.
export const recipientPronounsEnum = pgEnum("recipient_pronouns", [
  "she_her",
  "he_him",
  "they_them",
]);

export const supportPagesTable = pgTable("support_pages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  organiserId: text("organiser_id"),
  recipientName: text("recipient_name").notNull(),
  // Legacy, unused single contact field — superseded by the two typed columns
  // below. Left in place so no data is disturbed; not written by new code.
  recipientContact: text("recipient_contact"),
  // Where to reach the recipient about their own page. Captured at activation
  // (prefilled from the gift when we hold it, asked for when we don't) and
  // editable later via /manage. recipient_email is the channel the claim
  // notifications use now; recipient_mobile is captured optionally for SMS once
  // that path is wired. Both nullable: a recipient may activate without leaving
  // either, in which case notifications simply don't fire (the /manage "help
  // arriving" view is the fallback).
  recipientEmail: text("recipient_email"),
  recipientMobile: text("recipient_mobile"),
  situationDescription: text("situation_description"),
  location: text("location"),
  // An optional free-text note the recipient writes at activation, shown to
  // every helper on the public page (e.g. "text before you come; naps are
  // 12–2"). Nullable and additive — a page without one renders no card.
  goodToKnow: text("good_to_know"),
  status: pageStatusEnum("status").notNull().default("draft"),
  privacy: pagePrivacyEnum("privacy").notNull().default("open"),
  pin: text("pin"),
  approvalToken: text("approval_token"),
  // Carried onto the page at activation (from the gift, or set in the wizard).
  // Used to derive the situation line below, and to decide whether to default
  // the invite flow to self-share (bereavement) rather than an automated wave.
  occasion: giftOccasionEnum("occasion"),
  // Drives pronoun tokens in the helper invite copy. Defaults to they/them.
  recipientPronouns: recipientPronounsEnum("recipient_pronouns")
    .notNull()
    .default("they_them"),
  // The short, deliberately-vague phrase the invite copy drops in after the
  // recipient's name ("Sarah's <situationLine>"). Defaulted from the occasion
  // at activation and editable by the recipient — never clinical, never
  // detailed (see the privacy rules in CLAUDE.md).
  situationLine: text("situation_line"),
  // Set when a recipient activates their gift but chooses a future go-live
  // date. The page and its slots exist immediately with status 'draft' (so
  // nothing is visible at /s/:slug), and the existing dispatcher flips it to
  // 'active' once this timestamp passes. Null means "went live straight away".
  scheduledActivateAt: timestamp("scheduled_activate_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertSupportPageSchema = createInsertSchema(supportPagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportPage = z.infer<typeof insertSupportPageSchema>;
export type SupportPage = typeof supportPagesTable.$inferSelect;
