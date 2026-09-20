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

// Where a support page came from, so crisis-free pages can be counted and
// reported separately from paid and VIP-comp pages. 'gift' is reserved for the
// (untouched) gift redemption path; those pages currently keep origin null.
export const pageOriginEnum = pgEnum("page_origin", [
  "crisis_free",
  "organiser",
  "gift",
]);

// How the recipient is referred to in the warm invite copy sent to helpers.
// Defaults to they/them so nothing is ever assumed; the recipient sets this at
// activation. A name-only fallback is handled in the copy layer, not here.
export const recipientPronounsEnum = pgEnum("recipient_pronouns", [
  "she_her",
  "he_him",
  "they_them",
]);

// For a new_baby page: whether the baby's arrived yet, so the invite copy can
// read true either side of the birth (baby showers are gifted well ahead of the
// event). Nullable — null means "not asked / don't assume", and the copy layer
// falls back to a stage-agnostic default. Only meaningful when occasion is
// new_baby; harmless and unused for every other occasion.
export const babyStageEnum = pgEnum("baby_stage", ["expecting", "arrived"]);

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
  // How this page came to exist (Item 14). Nullable by design: legacy and
  // gift-redeemed pages read null; the crisis path writes 'crisis_free' and the
  // organiser wizard writes 'organiser'. Lets crisis-free pages be counted apart
  // from paid/VIP-comp pages without touching the paid redemption path.
  origin: pageOriginEnum("origin"),
  // Drives pronoun tokens in the helper invite copy. Defaults to they/them.
  recipientPronouns: recipientPronounsEnum("recipient_pronouns")
    .notNull()
    .default("they_them"),
  // The short, deliberately-vague phrase the invite copy drops in after the
  // recipient's name ("Sarah's <situationLine>"). Defaulted from the occasion
  // at activation and editable by the recipient — never clinical, never
  // detailed (see the privacy rules in CLAUDE.md).
  situationLine: text("situation_line"),
  // The trusted "support circle" counterpart to situationLine — the phrase the
  // 9b invite drops in for close people ("Sarah's <trustedLine>, and thought
  // you might…"). Same shape and fallback as situationLine: null means "use the
  // occasion (and baby-stage) default", resolved as
  // `page.trustedLine ?? defaultTrustedLine(occasion, babyStage)` at send time.
  trustedLine: text("trusted_line"),
  // new_baby only: 'expecting' | 'arrived', or null when not asked. Steers which
  // stage-appropriate default the invite copy uses, and can be flipped later via
  // /manage (e.g. set while pregnant, updated after the birth). Kept null-safe so
  // nothing is assumed. See babyStageEnum above.
  babyStage: babyStageEnum("baby_stage"),
  // Set when a recipient activates their gift but chooses a future go-live
  // date. The page and its slots exist immediately with status 'draft' (so
  // nothing is visible at /s/:slug), and the existing dispatcher flips it to
  // 'active' once this timestamp passes. Null means "went live straight away".
  scheduledActivateAt: timestamp("scheduled_activate_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // When the page was closed (bug #090). Null on every page that has never been
  // closed; set alongside status = 'closed' and deliberately NOT cleared when a
  // page is reopened — it is the record that it happened, not a live flag.
  //
  // Declared here since the original Replit-era commit and carried by no
  // migration until 0017, which adds it IF NOT EXISTS for any database built
  // from the migration files alone. See that file's header.
  //
  // ⚠️ Its real job is retention. Kate's lawyer has advised that personal
  // information must not be kept once it is no longer needed; every retention
  // rule will read "X after closure", and a date never written cannot be
  // backfilled. The retention work itself does not exist yet.
  closedAt: timestamp("closed_at"),
  // What the page WAS when it was closed, so reopening puts it BACK rather than
  // publishing it (bug #090, migration 0017).
  //
  // Closing a page that isn't live yet is legitimate — a scheduled gift page
  // whose recipient has died is one of the cases closure exists for — but
  // reopening one to 'active' would make a half-built page live that nobody
  // ever chose to publish. A draft closed and reopened is a draft again; a
  // scheduled gift goes back to scheduled (its scheduled_activate_at is never
  // touched, so the activation cron picks it up exactly as before).
  //
  // Plain TEXT, not the page_status enum, on purpose: this is a RECORD of a
  // past value, not a live status. It must never take part in a status query,
  // and it must survive the enum gaining or losing a value. Null means "closed
  // before this shipped" — restoredStatus() in api-server's lib/pageClosure.ts
  // falls back to 'active' and is the single place that decides so.
  //
  // NOT cleared on reopen: like closed_at, it is the record of what happened.
  statusBeforeClose: text("status_before_close"),
});

export const insertSupportPageSchema = createInsertSchema(supportPagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportPage = z.infer<typeof insertSupportPageSchema>;
export type SupportPage = typeof supportPagesTable.$inferSelect;
