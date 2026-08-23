import { pgTable, text, timestamp, boolean, date, time, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportPagesTable } from "./supportPages";

export const slotTypeEnum = pgEnum("slot_type", [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
]);

// Whether the time of a task is the helper's to nudge or the family's fact
// (Item 17 — "When plans change").
//   • flexible — a meal drop-off, a grocery run: a helper may reschedule the
//     time of day themselves (same day) from their claim link.
//   • fixed — a school pickup, a lift to an appointment: the time is the
//     family's fact, so a helper never edits it. They can leave a note or bow
//     out, but the clock is not theirs to move.
// Defaulted by task category at creation (see defaultFlexibility in the API's
// slotFlexibility lib) and flippable per task by the setup person / page runner
// — the recipient is never asked to set it. Unknown/custom tasks default to
// 'fixed', the conservative choice: nudging the time of something that turns
// out to be an appointment is worse than leaving a flexible task un-nudgeable.
export const slotFlexibilityEnum = pgEnum("slot_flexibility", [
  "flexible",
  "fixed",
]);

// Bug #033 — for a LIFT, the one fact a helper needs before they say yes: are
// they dropping someone off, waiting and bringing them home, or collecting them?
// "Drop off" is a twenty-minute favour; "wait" can be half a day. Nothing in the
// product said which, so a helper could claim expecting the first and lose an
// afternoon to the second.
//
// The VALUES here are stable and semantic. The words a helper actually reads
// live in the two liftWaitMode copy modules (api-server + rally) and can be
// reworded without a migration — nothing keys off the display labels.
export const liftWaitModeEnum = pgEnum("lift_wait_mode", [
  "drop_off",
  "wait",
  "pick_up",
]);

export const slotsTable = pgTable("slots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text("page_id")
    .notNull()
    .references(() => supportPagesTable.id, { onDelete: "cascade" }),
  slotType: slotTypeEnum("slot_type").notNull(),
  customLabel: text("custom_label"),
  // Item 17: is the time this task's helper's to nudge, or the family's fact?
  // Defaulted by category at creation and flippable per task by the page runner.
  // NOT NULL with a conservative 'fixed' default so a row inserted by older code
  // paths (or before the per-category default is applied) can never be treated
  // as freely reschedulable by accident. New inserts set it explicitly.
  flexibility: slotFlexibilityEnum("flexibility").notNull().default("fixed"),
  // Nullable on purpose: a slot with no date is a flexible offer ("a meal,
  // whenever suits") rather than an appointment. The date is filled in when a
  // helper claims it. Most tasks a recipient keeps at activation are undated —
  // asking someone recovering from birth or a bereavement to build a calendar
  // is the homework this product exists to remove.
  slotDate: date("slot_date"),
  slotTime: time("slot_time"),
  // Bug #033. NULLABLE WITH NO DEFAULT, and the absence is meaningful: NULL
  // means "not a lift, or nobody has said yet", and EVERY SURFACE RENDERS
  // NOTHING for it — no control on the tile, no clause in the confirmation
  // email or SMS, and the unchanged default calendar duration. A dated "pick up
  // a prescription" errand is a NULL row and must look exactly as it did before
  // this column existed; a wait-or-not question on a prescription is nonsense.
  //
  // The presence of this column is also what marks a task as a LIFT. There is no
  // 'lift' slot type: a lift is modelled as a dated errand (see
  // occasionSuggestions + the dated-errand reading in slotFlexibility). Adding
  // 'lift' to slot_type would have meant an ALTER TYPE ... ADD VALUE — the shape
  // that needed the 0003 enum catch-up — plus a new case in every switch on
  // slotType. See migration 0011.
  liftWaitMode: liftWaitModeEnum("lift_wait_mode"),
  notes: text("notes"),
  // Meal-specific, both nullable. A meal slot with no dietary notes and no
  // headcount is a perfectly valid flexible offer — these are encouraged, never
  // required, so a recipient or organiser in a hurry is never blocked (bug #006).
  // Left null on every non-meal slot type; only the meal setup UI collects them.
  //   • dietaryNotes — free text: allergies, "vegetarian household", etc. A
  //     helper cooking blind is exactly the problem this removes.
  //   • headcount — how many people the meal needs to feed.
  dietaryNotes: text("dietary_notes"),
  headcount: integer("headcount"),
  trustedHelpersOnly: boolean("trusted_helpers_only").notNull().default(false),
  isClaimed: boolean("is_claimed").notNull().default(false),
  claimedByName: text("claimed_by_name"),
  claimedByContact: text("claimed_by_contact"),
  claimedNote: text("claimed_note"),
  // The helper's private handle to release a claim they can no longer make.
  // Minted fresh every time the slot is claimed (public OR trusted-invite path)
  // and carried in the claim-confirmation email as a "Can't make it?" link.
  // Consumed (set null) the moment the claim is released, so a stale link from a
  // previous claim can never release a slot someone else has since taken — the
  // release update matches on this token AND is_claimed = true, so a re-claim
  // that rotates the token invalidates every earlier link. Null while unclaimed
  // and for any claim made before this column existed.
  cancelToken: text("cancel_token").unique(),
  // The helper's private handle to a subscribable .ics calendar feed for this
  // claim (GET /api/calendar/:token.ics). A sibling of cancel_token — minted
  // fresh on the SAME claims, unique, null while unclaimed — but deliberately
  // NOT consumed on release: the feed must survive a release so a subscribed
  // calendar can be told STATUS:CANCELLED rather than silently 404 (which many
  // calendar apps don't clean up). Re-claim rotates it like cancel_token, so a
  // released helper's feed stays cancelled even if someone else later re-takes
  // the slot (and it never resurfaces another helper's booking — the event
  // carries no helper identity, only the recipient's first name + task). Null
  // for any claim made before this column existed; those simply get no feed.
  calendarToken: text("calendar_token").unique(),
  // Soft-state audit of a released claim, mirroring the gift-signing "removed"
  // pattern (a record it happened, never a full wipe). The live claim_by_*
  // columns are cleared on release so the freed slot never leaks the old
  // helper's name onto the public page; these snapshot who last dropped out and
  // when, purely for the record. Overwritten only by the next release, so they
  // always describe the most recent one; untouched by a re-claim.
  claimCancelledAt: timestamp("claim_cancelled_at"),
  cancelledClaimName: text("cancelled_claim_name"),
  cancelledClaimContact: text("cancelled_claim_contact"),
  // When the slot was claimed. Drives the batched recipient notification (which
  // claims are new) and the "when" shown on /manage. Null for claims made before
  // this column existed — see the backfill in migration 0002.
  claimedAt: timestamp("claimed_at"),
  // The helper's opt-in choice at claim time. Default false: a helper's name is
  // shown on the public /s/ page ONLY if they ticked "show my name". The
  // recipient always sees the name on /manage regardless — that read is never
  // gated by this flag. See CLAUDE.md "Helper visibility — presence vs names".
  claimedNameVisible: boolean("claimed_name_visible").notNull().default(false),
  // Set by the claim-notification dispatcher once this claim has been included
  // in a batch to the recipient, so it is never notified twice. Backfilled to
  // now() for pre-existing claims so they are treated as already-notified.
  recipientNotifiedAt: timestamp("recipient_notified_at"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSlotSchema = createInsertSchema(slotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Slot = typeof slotsTable.$inferSelect;
