import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// The keywords Twilio treats as opt-out. We honour the same set so our own
// suppression matches the carrier's, and a contact never gets a message we
// think is fine but the carrier has already blocked.
const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

/**
 * POST /api/twilio/inbound — inbound SMS webhook.
 *
 * When a contact replies STOP (or any standard keyword), suppress every contact
 * row that shares that mobile number, across all pages. This is what makes
 * "reply STOP anytime" genuinely stop future sends rather than just reading
 * nicely in the copy. Twilio also blocks the number at the carrier level; this
 * keeps our own outbox from even trying.
 *
 * Responds with empty TwiML so Twilio sends no automatic reply of its own.
 */
router.post("/twilio/inbound", async (req, res) => {
  const from = typeof req.body?.From === "string" ? req.body.From.trim() : "";
  const bodyText = typeof req.body?.Body === "string" ? req.body.Body.trim().toLowerCase() : "";

  if (from && STOP_KEYWORDS.has(bodyText)) {
    const updated = await db
      .update(contactsTable)
      .set({ optedOutAt: new Date() })
      .where(and(eq(contactsTable.mobile, from), isNull(contactsTable.optedOutAt)))
      .returning({ id: contactsTable.id });
    logger.info({ from, suppressed: updated.length }, "Inbound STOP — contacts suppressed");
  }

  res.set("Content-Type", "text/xml").send("<Response></Response>");
});

/**
 * GET /api/unsubscribe/:contactId — one-click email unsubscribe.
 *
 * The contact id is a random UUID, so the link is unguessable. Idempotent: a
 * second click just confirms again. Returns a small self-contained page since
 * this is opened directly in a browser from an email.
 */
router.get("/unsubscribe/:contactId", async (req, res) => {
  const { contactId } = req.params;

  const contact = await db.query.contactsTable.findFirst({
    where: eq(contactsTable.id, contactId),
  });

  if (contact && !contact.optedOutAt) {
    await db
      .update(contactsTable)
      .set({ optedOutAt: new Date() })
      .where(eq(contactsTable.id, contactId));
    logger.info({ contactId }, "Email unsubscribe — contact suppressed");
  }

  const message = contact
    ? "You're unsubscribed. You won't receive any more of these emails."
    : "This link isn't valid, but you won't receive any more of these emails.";

  res
    .status(200)
    .set("Content-Type", "text/html")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#FAF7F2;"><div style="max-width:480px;margin:64px auto;padding:32px;background:#fff;border-radius:12px;text-align:center;"><h1 style="color:#2D6A4F;font-size:20px;">Aunt Lucy</h1><p style="color:#333;font-size:16px;line-height:1.6;">${message}</p></div></body></html>`);
});

export default router;
