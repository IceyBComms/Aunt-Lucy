import { Router, type IRouter } from "express";
import { db, giftsTable, giftSigningsTable, type Gift } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { firstName, sealCard, signingLinkFor } from "../lib/giftFulfilment";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * The workplace team card — colleagues sign, the organiser reviews and seals.
 *
 * Three token-gated audiences, exactly like the rest of the "link is not the
 * lock" model: a public signing_token anyone can use to add a note, a private
 * organiser_token for review/remove/seal, and (elsewhere) the recipient's
 * redemption_token for the keepsake. No accounts, ever.
 */

/** A required name, and a note capped so it stays a note, not an essay. */
const MESSAGE_MAX = 500;
const NAME_MAX = 80;
const ORG_MAX = 80;

/** A soft ceiling on visible signers, purely to blunt abuse of a public link. */
const SIGNER_CAP = 100;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function countVisible(giftId: string): Promise<number> {
  const rows = await db
    .select({ id: giftSigningsTable.id })
    .from(giftSigningsTable)
    .where(
      and(
        eq(giftSigningsTable.giftId, giftId),
        eq(giftSigningsTable.status, "visible"),
      ),
    );
  return rows.length;
}

// ─── Signer-facing (public, keyed by signing_token) ──────────────────────────

/**
 * GET /api/sign/:signingToken — the card context for the signing page.
 *
 * Replaces the hard-coded RECIPIENT / ORG / ORGANISER / ALREADY_SIGNED props.
 * Returns a `closed` flag once the card is sealed so the page can show the
 * gentle "already sent" state instead of the form.
 */
router.get("/sign/:signingToken", async (req, res) => {
  const { signingToken } = req.params;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.signingToken, signingToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This signing link isn't valid." });
    return;
  }

  const closed = !!gift.cardSealedAt;

  res.json({
    // First name only — a signing link is shared widely, so it never carries
    // the recipient's full name.
    recipientFirstName: firstName(gift.recipientName),
    organiserName: firstName(gift.purchaserName),
    organisationName: gift.organisationName ?? null,
    // A sealed card accepts no more notes; the count still reflects reality.
    signedCount: await countVisible(gift.id),
    closed,
  });
});

/**
 * POST /api/sign/:signingToken — add a note to the card.
 *
 * Rejects a blank name, an empty or over-long message, a sealed card, and
 * anything past the abuse cap. No editing, no anonymous notes, no account.
 */
router.post("/sign/:signingToken", async (req, res) => {
  const { signingToken } = req.params;
  const body = req.body as Record<string, unknown>;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.signingToken, signingToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This signing link isn't valid." });
    return;
  }

  if (gift.cardSealedAt) {
    res
      .status(409)
      .json({ error: "This card's been sent already — but thank you for wanting to sign." });
    return;
  }

  const signerName = trimmed(body.signerName);
  const message = trimmed(body.message);

  if (!signerName) {
    res.status(400).json({ error: "Please add your name — even just the team's." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "Please add a line or two before signing." });
    return;
  }
  if (signerName.length > NAME_MAX) {
    res.status(400).json({ error: "That name is a little long — please shorten it." });
    return;
  }
  if (message.length > MESSAGE_MAX) {
    res.status(400).json({ error: "That note is a little long — please shorten it." });
    return;
  }

  // The cap counts only visible notes, so an organiser who removes one frees a
  // slot. Checked before insert; a rare race just lets one extra note through,
  // which is harmless for an anti-abuse soft cap.
  if ((await countVisible(gift.id)) >= SIGNER_CAP) {
    res
      .status(409)
      .json({ error: "This card's full of lovely notes already — thank you!" });
    return;
  }

  await db.insert(giftSigningsTable).values({ giftId: gift.id, signerName, message });

  res.status(201).json({ signedCount: await countVisible(gift.id) });
});

// ─── Organiser-facing (private, keyed by organiser_token) ────────────────────

/**
 * Loads the gift for an organiser_token, or answers 404. Kept local rather than
 * a middleware because there are only three organiser routes and they each want
 * the gift row anyway.
 */
async function organiserGift(token: string): Promise<Gift | undefined> {
  if (!token) return undefined;
  return db.query.giftsTable.findFirst({
    where: eq(giftsTable.organiserToken, token),
  });
}

/**
 * GET /api/card/:organiserToken — the organiser's review view.
 *
 * Lists the visible notes (a removed note is gone from here too), the share
 * link to copy, and whether the card has been sealed.
 */
router.get("/card/:organiserToken", async (req, res) => {
  const gift = await organiserGift(req.params.organiserToken);
  if (!gift || !gift.signingToken) {
    res.status(404).json({ error: "This card link isn't valid." });
    return;
  }

  const signings = await db.query.giftSigningsTable.findMany({
    where: and(
      eq(giftSigningsTable.giftId, gift.id),
      eq(giftSigningsTable.status, "visible"),
    ),
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });

  res.json({
    recipientFirstName: firstName(gift.recipientName),
    organisationName: gift.organisationName ?? null,
    signingLink: signingLinkFor(gift.signingToken),
    sealed: !!gift.cardSealedAt,
    sealedAt: gift.cardSealedAt?.toISOString() ?? null,
    signings: signings.map((s) => ({
      id: s.id,
      signerName: s.signerName,
      message: s.message,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

/**
 * PATCH /api/card/:organiserToken — set the organisation name shown on the card.
 *
 * Optional, organiser-only. Not captured at purchase, so this is where "everyone
 * at {org}" comes from; left null the copy simply drops the "at {org}" clause.
 */
router.patch("/card/:organiserToken", async (req, res) => {
  const gift = await organiserGift(req.params.organiserToken);
  if (!gift || !gift.signingToken) {
    res.status(404).json({ error: "This card link isn't valid." });
    return;
  }

  const organisationName = trimmed((req.body as Record<string, unknown>).organisationName);
  if (organisationName.length > ORG_MAX) {
    res.status(400).json({ error: "That name is a little long — please shorten it." });
    return;
  }

  await db
    .update(giftsTable)
    .set({ organisationName: organisationName || null })
    .where(eq(giftsTable.id, gift.id));

  res.json({ organisationName: organisationName || null });
});

/**
 * POST /api/card/:organiserToken/signings/:id/remove — soft-remove a note.
 *
 * Light-touch, organiser-only moderation. The row is kept (status → removed),
 * so nothing is hard-deleted; it just stops showing on the card and stops
 * counting. Idempotent, and scoped to this gift so one organiser can't touch
 * another card's notes.
 */
router.post("/card/:organiserToken/signings/:id/remove", async (req, res) => {
  const gift = await organiserGift(req.params.organiserToken);
  if (!gift || !gift.signingToken) {
    res.status(404).json({ error: "This card link isn't valid." });
    return;
  }

  if (gift.cardSealedAt) {
    res.status(409).json({ error: "This card's already been sent." });
    return;
  }

  const [updated] = await db
    .update(giftSigningsTable)
    .set({ status: "removed", removedAt: new Date() })
    .where(
      and(
        eq(giftSigningsTable.id, req.params.id),
        eq(giftSigningsTable.giftId, gift.id),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "That note couldn't be found." });
    return;
  }

  res.json({ ok: true });
});

/**
 * POST /api/card/:organiserToken/seal — "Send the card".
 *
 * Seals the card (no more notes) and triggers delivery of the keepsake to the
 * recipient — now, or on the buyer's chosen deliver_at. Idempotent: a card
 * already sealed answers cleanly rather than delivering twice.
 */
router.post("/card/:organiserToken/seal", async (req, res) => {
  const gift = await organiserGift(req.params.organiserToken);
  if (!gift || !gift.signingToken) {
    res.status(404).json({ error: "This card link isn't valid." });
    return;
  }

  const result = await sealCard({ gift, reason: "organiser" });

  if (!result.sealed) {
    // Already sealed — a double-tap on "Send". Report success with the existing
    // state rather than an error the organiser did nothing to deserve.
    res.json({ sealed: true, alreadySealed: true });
    return;
  }

  logger.info(
    { giftId: gift.id, delivery: result.delivery },
    "Organiser sealed the card",
  );

  res.json({
    sealed: true,
    alreadySealed: false,
    delivery: result.delivery,
    // When there's no recipient email, the organiser passes this link on by hand.
    giftLink: result.delivery === "manual" ? result.giftLink : null,
  });
});

export default router;
