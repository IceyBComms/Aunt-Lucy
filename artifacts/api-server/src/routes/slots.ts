import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, slotsTable, supportPagesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { sendClaimConfirmation } from "../lib/email";
import { verifyPin } from "../lib/pin";
import { getAppBaseUrl } from "../lib/appUrl";
import { logger } from "../lib/logger";
import { notifyRecipientOfTaskEvent, shareLinkFor } from "../lib/item17Notify";
import {
  taskLabel,
  whenLabel,
  timeLabel,
  recipientFixedLostHelper,
  recipientFlexibleCancelled,
  recipientFlexibleRescheduled,
  recipientNotePassedOn,
} from "../lib/item17Copy";

const router: IRouter = Router();

/** The helper's private release handle, minted fresh on every claim. */
function mintCancelToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

router.post("/slots/:slotId/claim", async (req, res) => {
  const { slotId } = req.params;
  const { firstName, contact, note, pin, showName } = req.body as {
    firstName: string;
    contact: string;
    note?: string;
    pin?: string;
    showName?: boolean;
  };

  const firstNameTrimmed = typeof firstName === "string" ? firstName.trim() : "";
  const contactTrimmed = typeof contact === "string" ? contact.trim() : "";

  if (!firstNameTrimmed || !contactTrimmed) {
    res.status(400).json({ error: "First name and contact are required." });
    return;
  }
  if (firstNameTrimmed.length > 100 || contactTrimmed.length > 200) {
    res.status(400).json({ error: "Input exceeds maximum length." });
    return;
  }

  // Load slot together with its parent page to enforce PIN protection
  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(eq(slotsTable.id, slotId))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  const { slot, page } = result;

  // Only allow claiming on active pages
  if (page.status !== "active") {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  // Trusted-only slots are never claimable through the public door. The trust
  // gate for these lives entirely on the invite path (POST /invite/:token/claim),
  // where the token IS the trust check. The public page already omits these slots
  // from its listing (see routes/pages.ts), but the slot id can leak — a forwarded
  // invite exposes it via GET /invite/:token — so we must re-check here rather than
  // rely on the id staying secret. We answer 404 with the same message as a missing
  // or inactive slot: the public door must not reveal that a trusted slot exists,
  // exactly as it doesn't appear on the public page. "Trusted only" means trusted only.
  if (slot.trustedHelpersOnly === true) {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  // PIN-protected pages require the PIN when claiming
  if (page.privacy === "pin_protected") {
    if (!pin || !(await verifyPin(pin, page.pin))) {
      res.status(401).json({ error: "A valid PIN is required to claim a slot on this page." });
      return;
    }
  }

  const cancelToken = mintCancelToken();

  // Atomic conditional update: only update if is_claimed = false.
  // Prevents race conditions where two helpers claim simultaneously.
  const updated = await db
    .update(slotsTable)
    .set({
      isClaimed: true,
      claimedByName: firstNameTrimmed,
      claimedByContact: contactTrimmed,
      claimedNote: note?.trim() ?? null,
      claimedAt: new Date(),
      // Opt-in, defaulting false: the name is shown to other helpers on the
      // public page only if the helper ticked "show my name". The recipient sees
      // it either way (via /manage), so this flag never hides it from them.
      claimedNameVisible: showName === true,
      // A fresh release handle for this claim (see POST /slots/release/:token).
      // Rotating it on every claim means an old link can never touch a re-taken
      // slot.
      cancelToken,
    })
    .where(and(eq(slotsTable.id, slot.id), eq(slotsTable.isClaimed, false)))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "This slot has already been claimed by someone else." });
    return;
  }

  const [row] = updated;

  void sendClaimConfirmation({
    helperFirstName: firstNameTrimmed,
    helperContact: contactTrimmed,
    recipientName: page.recipientName,
    slotType: row.slotType,
    customLabel: row.customLabel,
    slotDate: row.slotDate,
    slotTime: row.slotTime,
    notes: row.notes,
    dietaryNotes: row.dietaryNotes,
    headcount: row.headcount,
    location: page.location,
    // The one-tap "Can't make it? Release this slot" link. Its token is unique
    // to this claim, so it's the helper's own handle and needs no account.
    releaseUrl: `${getAppBaseUrl()}/release/${cancelToken}`,
  });

  res.json({
    id: row.id,
    pageId: row.pageId,
    slotType: row.slotType,
    customLabel: row.customLabel ?? null,
    slotDate: row.slotDate,
    slotTime: row.slotTime ?? null,
    notes: row.notes ?? null,
    dietaryNotes: row.dietaryNotes ?? null,
    headcount: row.headcount ?? null,
    isClaimed: row.isClaimed,
    claimedByName: row.claimedByName ?? null,
    claimedNote: row.claimedNote ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

// ─── Release (un-claim) a slot ────────────────────────────────────────────────
//
// The reverse of a claim, reachable only through the cancel_token minted at
// claim time and carried in the confirmation email — no account, nothing to
// remember beyond the link the helper already has. The token IS the
// authorisation: only the person who claimed the slot holds it, so there is no
// "cancel any slot" surface. Works identically for a public claim and a
// trusted-invite claim — releasing only ever touches the slot, never the
// trusted-helper invite logic.

/**
 * GET /api/slots/release/:token — what this release link is for.
 *
 * Answers just enough for the confirmation screen: the task and who's on it.
 * A token only exists while a claim is live, so once the slot is released (or
 * re-taken, which rotates the token) this 404s — the page then shows a gentle
 * "already released / no longer active" message rather than an error.
 */
router.get("/slots/release/:token", async (req, res) => {
  const { token } = req.params;

  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This link is no longer active." });
    return;
  }

  const { slot, page } = result;
  res.json({
    slot: {
      id: slot.id,
      slotType: slot.slotType,
      customLabel: slot.customLabel,
      slotDate: slot.slotDate,
      slotTime: slot.slotTime,
      notes: slot.notes,
      // Item 17: drives which controls the claim link offers — a flexible task
      // gets the reschedule block, a fixed task gets note-only.
      flexibility: slot.flexibility,
      // The helper's current note (latest-version-only), so the note field can
      // prefill. Private to the recipient/runner; never shown on the public page.
      claimedNote: slot.claimedNote ?? null,
    },
    helperName: slot.claimedByName,
    page: {
      recipientName: page.recipientName,
      location: page.location,
    },
  });
});

/**
 * POST /api/slots/release/:token — hand the slot back.
 *
 * Atomic and idempotent-safe: the update matches on (cancel_token, is_claimed =
 * true), so a second press, or a race where someone else already re-claimed the
 * slot (rotating the token), simply matches zero rows and returns a calm 404
 * without freeing anything or notifying anyone twice.
 *
 * On success the live claim is cleared (so the freed slot never shows the old
 * helper's name on the public page) but snapshotted into the cancelled_claim_*
 * columns first — a record it happened, not a wipe. The notification/reminder
 * stamps are reset so that if the slot is claimed again it's treated as the
 * fresh claim it is. The token is consumed (set null) so the link can't be
 * reused.
 */
router.post("/slots/release/:token", async (req, res) => {
  const { token } = req.params;

  const now = new Date();
  const released = await db
    .update(slotsTable)
    .set({
      isClaimed: false,
      // Snapshot the outgoing claim for the record (RHS reads the pre-update
      // row, so this copies the current claim atomically within the UPDATE).
      cancelledClaimName: sql`${slotsTable.claimedByName}`,
      cancelledClaimContact: sql`${slotsTable.claimedByContact}`,
      claimCancelledAt: now,
      // Clear the live claim so the reopened slot leaks nothing.
      claimedByName: null,
      claimedByContact: null,
      claimedNote: null,
      claimedAt: null,
      claimedNameVisible: false,
      // Reset so a future re-claim of this slot notifies + reminds afresh.
      recipientNotifiedAt: null,
      reminderSent: false,
      // Consume the handle: this link is spent.
      cancelToken: null,
    })
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .returning();

  if (released.length === 0) {
    // Already released, already re-taken, or never valid — all the same to the
    // helper, and none of them should error or re-notify.
    res.status(404).json({ error: "This slot has already been released." });
    return;
  }

  const [row] = released;

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, row.pageId),
  });

  // Tell the recipient (and the runner, once distinct) a slot has opened back
  // up — on the channel the flexible/fixed rule chooses. This is the un-claim
  // wiring the Item 17 brief asked for: before this, a released slot only ever
  // emailed the recipient, so a FIXED task (a school pickup) could silently lose
  // its helper if they had no inbox open. Now a fixed task always goes by SMS.
  // Fire-and-forget, exactly like the claim confirmation.
  if (page) {
    const label = taskLabel(row.slotType, row.customLabel);
    const shareLink = shareLinkFor(page);
    const helperName = row.cancelledClaimName ?? "Someone";
    const message =
      row.flexibility === "fixed"
        ? recipientFixedLostHelper({
            helperName,
            task: label,
            when: whenLabel(row.slotDate, row.slotTime),
            shareLink,
          })
        : recipientFlexibleCancelled({ helperName, task: label, shareLink });

    void notifyRecipientOfTaskEvent(page, {
      flexibility: row.flexibility,
      slotDate: row.slotDate,
      message,
      link: shareLink,
    });
  }

  logger.info(
    { slotId: row.id, pageId: row.pageId },
    "Helper released a claimed slot",
  );

  res.json({ ok: true });
});

// ─── Helper reschedule / note (Item 17) ───────────────────────────────────────
//
// Reachable only through the same cancel_token the release link uses — the
// helper's own private handle, no account, ever. Both are one-way to the family:
// no reply, no thread. The un-claim path above is unchanged; these sit beside it.

const HELPER_NOTE_MAX = 200;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * POST /api/slots/reschedule/:token — a FLEXIBLE task's helper nudges the time
 * of day (same day only), with an optional short note. A different day is not an
 * edit — the UI steers them to bow out or leave a note — so slot_date is never
 * touched here. Fixed tasks are refused: their time is the family's fact.
 */
router.post("/slots/reschedule/:token", async (req, res) => {
  const { token } = req.params;
  const { slotTime, note } = req.body as { slotTime?: string; note?: string };

  const time = typeof slotTime === "string" ? slotTime.trim() : "";
  if (!time || !TIME_RE.test(time)) {
    res.status(400).json({ error: "That time doesn't look right — please try again." });
    return;
  }
  const noteTrimmed = typeof note === "string" ? note.trim() : "";
  if (noteTrimmed.length > HELPER_NOTE_MAX) {
    res.status(400).json({ error: "That note's a little long — please shorten it." });
    return;
  }

  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This link is no longer active." });
    return;
  }
  const { slot, page } = result;

  // Fixed tasks can't be rescheduled by a helper — the guardrail on the UI
  // should prevent this, but the time is the family's fact, so we enforce it.
  if (slot.flexibility !== "flexible") {
    res.status(409).json({ error: "This task's time is set by the family." });
    return;
  }

  const [updated] = await db
    .update(slotsTable)
    .set({
      slotTime: time,
      // A note is optional; when present it replaces the latest note (one-way,
      // recipient-only). An empty note leaves any existing note untouched.
      ...(noteTrimmed ? { claimedNote: noteTrimmed } : {}),
    })
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .returning();

  // Tell the recipient — flexible → email, upgraded to SMS if today/tomorrow.
  void notifyRecipientOfTaskEvent(page, {
    flexibility: "flexible",
    slotDate: updated.slotDate,
    message: recipientFlexibleRescheduled({
      helperName: updated.claimedByName ?? "Someone",
      task: taskLabel(updated.slotType, updated.customLabel),
      newTime: timeLabel(time),
    }),
  });

  logger.info({ slotId: updated.id, pageId: updated.pageId }, "Item 17: helper rescheduled a flexible task");
  res.json({ ok: true });
});

/**
 * POST /api/slots/note/:token — leave (or update) one short note on any claimed
 * task. Latest-version-only, max 200 chars, visible ONLY to the recipient +
 * runner. One-way: no replies, no thread.
 */
router.post("/slots/note/:token", async (req, res) => {
  const { token } = req.params;
  const { note } = req.body as { note?: string };

  const noteTrimmed = typeof note === "string" ? note.trim() : "";
  if (!noteTrimmed) {
    res.status(400).json({ error: "Add a note to pass on." });
    return;
  }
  if (noteTrimmed.length > HELPER_NOTE_MAX) {
    res.status(400).json({ error: "That note's a little long — please shorten it." });
    return;
  }

  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This link is no longer active." });
    return;
  }
  const { slot, page } = result;

  const [updated] = await db
    .update(slotsTable)
    .set({ claimedNote: noteTrimmed })
    .where(and(eq(slotsTable.cancelToken, token), eq(slotsTable.isClaimed, true)))
    .returning();

  // Pass the note on to the recipient on the flexibility channel — a note on a
  // fixed same-day task (a school pickup) is worth an SMS just like a change to
  // it would be.
  void notifyRecipientOfTaskEvent(page, {
    flexibility: slot.flexibility,
    slotDate: updated.slotDate,
    message: recipientNotePassedOn({
      helperName: updated.claimedByName ?? "Someone",
      task: taskLabel(updated.slotType, updated.customLabel),
      note: noteTrimmed,
    }),
  });

  logger.info({ slotId: updated.id, pageId: updated.pageId }, "Item 17: helper left a note");
  res.json({ ok: true });
});

export default router;
