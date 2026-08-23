import { Router, type IRouter } from "express";
import { db, slotsTable, supportPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { firstName } from "../lib/giftFulfilment";
import { buildClaimIcs } from "../lib/calendarFeed";

const router: IRouter = Router();

// ─── Calendar feed (one per claim) ────────────────────────────────────────────
//
// GET /api/calendar/:token.ics — a subscribable .ics feed for a single claim,
// reached only through the private calendar_token (see lib/calendarFeed and the
// slots.calendar_token schema comment). The token IS the access; no account.
//
// Generated fresh from the live slot on every fetch, so a subscribed calendar
// always sees current state: STATUS:CONFIRMED while claimed, STATUS:CANCELLED
// once released (the whole reason calendar_token outlives cancel_token). A token
// that never existed — or was rotated away by a re-claim — 404s.
router.get("/calendar/:token", async (req, res) => {
  // The URL ends in ".ics" so calendar apps recognise it; the param captures the
  // whole segment, so strip the extension back off to get the raw token.
  const token = req.params.token.replace(/\.ics$/i, "");

  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(eq(slotsTable.calendarToken, token))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This calendar link is no longer active." });
    return;
  }

  const { slot, page } = result;

  const ics = buildClaimIcs({
    slotId: slot.id,
    slotType: slot.slotType,
    customLabel: slot.customLabel,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    // Bug #033 — drives the event DURATION, not just its words.
    liftWaitMode: slot.liftWaitMode,
    recipientFirstName: firstName(page.recipientName),
    location: page.location,
    // is_claimed drives CONFIRMED vs CANCELLED. A released slot keeps its
    // calendar_token (unlike cancel_token) precisely so this branch can render
    // the cancellation instead of 404-ing.
    claimed: slot.isClaimed,
  });

  res
    .status(200)
    .type("text/calendar; charset=utf-8")
    // Let calendar apps re-read the live feed rather than serve a stale copy.
    .set("Cache-Control", "no-cache, max-age=0, must-revalidate")
    // inline so a subscribing app handles it; browsers still offer to save it.
    .set("Content-Disposition", 'inline; filename="aunt-lucy.ics"')
    .send(ics);
});

export default router;
