import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, giftsTable, giftSigningsTable, supportPagesTable, slotsTable, pageGrantsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { suggestionsFor, type SuggestedTask } from "../lib/occasionSuggestions";
import { uniqueSlug } from "../lib/slug";
import { defaultSituationLine, type RecipientPronouns } from "../lib/inviteCopy";
import { TIERS, sellableTier } from "../lib/giftPricing";
import { uniqueToken } from "../lib/token";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Occasions a gift can carry, mirrored by the gift_occasion enum. */
const OCCASIONS = [
  "new_baby",
  "illness_recovery",
  "bereavement",
  "ongoing_support",
  "other",
] as const;

type Occasion = (typeof OCCASIONS)[number];

function asOccasion(value: unknown): Occasion | null {
  return typeof value === "string" && OCCASIONS.includes(value as Occasion)
    ? (value as Occasion)
    : null;
}

/** Loose email check for the purchase form — a value is kept only if plausible. */
function asEmail(value: unknown): string | null {
  const email = trimmed(value);
  return email.includes("@") ? email : null;
}

const PRONOUN_VALUES: readonly RecipientPronouns[] = ["she_her", "he_him", "they_them"];

function asPronouns(value: unknown): RecipientPronouns {
  return typeof value === "string" && (PRONOUN_VALUES as readonly string[]).includes(value)
    ? (value as RecipientPronouns)
    : "they_them";
}

/** Slot types the database accepts, for validating tasks the recipient adds. */
const SLOT_TYPES = [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
] as const;

type SlotType = (typeof SLOT_TYPES)[number];

/**
 * Tasks that involve being alone with someone's children default to trusted
 * helpers regardless of what the client sends. This mirrors the rule in
 * routes/organiser.ts — the recipient may raise a task's sensitivity but may
 * not accidentally lower these two below it.
 */
const ALWAYS_TRUSTED: readonly string[] = ["school_pickup", "child_care"];

/** Gift states from which activation makes sense. */
const ACTIVATABLE: readonly string[] = ["paid", "delivered"];

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function asSlotType(value: unknown): SlotType | null {
  return typeof value === "string" && SLOT_TYPES.includes(value as SlotType)
    ? (value as SlotType)
    : null;
}

/** A date is optional everywhere in this flow, but must be real if supplied. */
function asSlotDate(value: unknown): string | null {
  const raw = trimmed(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
}

// GET /api/gift-tiers — what can be bought, and for how much.
//
// The price lives on the server so the buyer-facing figure can never drift from
// what the Stripe link actually charges. Note what is NOT in the response:
// paymentLink. A pack tier has no link at all, and a sellable tier's link is
// only ever used server-side by POST /gifts below, so the browser is never
// handed a URL it could use to skip creating the gift row.
router.get("/gift-tiers", async (_req, res) => {
  res.json(
    TIERS.map((tier) => ({
      id: tier.id,
      label: tier.label,
      blurb: tier.blurb,
      amountCents: tier.amountCents,
      gifts: tier.gifts,
      sellable: tier.sellable,
    })),
  );
});

// POST /api/gifts — create the pending gift, then hand back where to pay.
//
// This is the front half of the purchase handshake. The row must exist before
// the buyer reaches Stripe, because the Stripe webhook matches the payment back
// by client_reference_id = gift.id and can do nothing at all if no row is
// waiting. Appending that parameter here rather than in the browser is
// deliberate: it makes it structurally impossible to send someone to checkout
// without the handshake attached.
router.post("/gifts", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  // The pack gate. sellableTier() returns undefined for the 5- and 10-packs, so
  // a hand-crafted request naming one is refused here — the UI gate on the tier
  // picker is presentation, this is the one that counts. See giftPricing.ts.
  const tier = sellableTier(trimmed(body.tierId));
  if (!tier?.paymentLink) {
    res.status(400).json({ error: "That gift isn't available to buy yet." });
    return;
  }

  const purchaserName = trimmed(body.purchaserName);
  const purchaserEmail = asEmail(body.purchaserEmail);
  if (!purchaserName || !purchaserEmail) {
    res.status(400).json({ error: "Just need a name and a situation — that's all." });
    return;
  }

  const forSelf = body.forSelf === true;
  const recipientName = forSelf ? purchaserName : trimmed(body.recipientName);
  if (!recipientName) {
    res.status(400).json({ error: "Just need a name and a situation — that's all." });
    return;
  }

  // When the buyer is setting this up for themselves they are the recipient, so
  // the gift is delivered to them and there is no "from" note to show.
  //
  // Otherwise recipientEmail may be null: the buyer chose to pass the link on
  // themselves (they gave a mobile, or nothing). Fulfilment already reads a
  // null recipient email as "send the link to the buyer to deliver by hand", so
  // there is nothing more to record here — and deliberately no mobile column,
  // since gathering the recipient's contact details is the activation flow.
  const recipientEmail = forSelf ? purchaserEmail : asEmail(body.recipientEmail);

  const giftedByNote = forSelf ? null : trimmed(body.giftedByNote) || null;

  // "Now" arrives as null rather than a timestamp — fulfilPaidGift treats null
  // as "as soon as the payment clears", which is exactly right and avoids a
  // date in the past if the buyer sits on the Stripe page for a while.
  const deliverAtRaw = trimmed(body.deliverAt);
  const deliverAt = deliverAtRaw ? new Date(deliverAtRaw) : null;
  if (deliverAt && Number.isNaN(deliverAt.getTime())) {
    res.status(400).json({ error: "That delivery date doesn't look right." });
    return;
  }

  const redemptionToken = await uniqueToken(async (token) => {
    const existing = await db.query.giftsTable.findFirst({
      where: eq(giftsTable.redemptionToken, token),
    });
    return !!existing;
  });

  // Workplace card tiers carry a team card. Mint its two public tokens now, at
  // purchase, so the organiser share email at fulfilment already has the signing
  // link. A consumer gift has no card and both stay null. Each is checked for
  // collision against its own column, exactly like the redemption token.
  let signingToken: string | null = null;
  let organiserToken: string | null = null;
  if (tier.hasCard) {
    signingToken = await uniqueToken(async (token) => {
      const existing = await db.query.giftsTable.findFirst({
        where: eq(giftsTable.signingToken, token),
      });
      return !!existing;
    });
    organiserToken = await uniqueToken(async (token) => {
      const existing = await db.query.giftsTable.findFirst({
        where: eq(giftsTable.organiserToken, token),
      });
      return !!existing;
    });
  }

  const [gift] = await db
    .insert(giftsTable)
    .values({
      redemptionToken,
      signingToken,
      organiserToken,
      purchaserName,
      purchaserEmail,
      recipientName,
      recipientEmail,
      occasion: asOccasion(body.occasion),
      giftedByNote,
      // Never from the client — the buyer cannot choose their own price.
      amountCents: tier.amountCents,
      currency: "AUD",
      status: "pending",
      deliverAt,
    })
    .returning();

  // ── The handshake ──
  // gift.id, not redemptionToken: the webhook looks the gift up by primary key,
  // and the redemption token is the recipient's private URL — it must never
  // travel through a payment query string.
  const checkoutUrl = new URL(tier.paymentLink);
  checkoutUrl.searchParams.set("client_reference_id", gift.id);

  logger.info(
    { giftId: gift.id, tierId: tier.id, amountCents: tier.amountCents },
    "Pending gift created, sending buyer to checkout",
  );

  res.status(201).json({ checkoutUrl: checkoutUrl.toString() });
});

// GET /api/gifts/:redemptionToken — the keepsake (read-only, no account).
router.get("/gifts/:redemptionToken", async (req, res) => {
  const { redemptionToken } = req.params;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, redemptionToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This gift link isn't valid." });
    return;
  }

  // The gift experience is a read-only keepsake and is shown even before it
  // has been delivered (delivered_at may still be null) — we deliberately do
  // not gate on delivery here.
  //
  // Two rules on the notes, though:
  //   • Only `visible` notes — a note the organiser soft-removed never shows.
  //   • For a card gift, notes appear only once the card is sealed. Delivery is
  //     gated on the seal, so the recipient shouldn't arrive early anyway, but
  //     this guarantees they never glimpse a half-signed card even if they do.
  const cardHidden = !!gift.signingToken && !gift.cardSealedAt;
  const signings = cardHidden
    ? []
    : await db.query.giftSigningsTable.findMany({
        where: and(
          eq(giftSigningsTable.giftId, gift.id),
          eq(giftSigningsTable.status, "visible"),
        ),
        orderBy: (s, { asc }) => [asc(s.createdAt)],
      });

  res.json({
    recipientName: gift.recipientName,
    organisationMessage: gift.giftedByNote ?? null,
    giftedBy: gift.purchaserName,
    occasion: gift.occasion ?? null,
    signings: signings.map((s) => ({
      signerName: s.signerName,
      message: s.message,
    })),
  });
});

/**
 * GET /api/gifts/:redemptionToken/review — what the recipient steers.
 *
 * Token-gated, not auth-gated: the recipient has no account and will never be
 * asked for one. The unguessable token in the URL is the credential, exactly
 * as it is for a support page slug.
 *
 * Two shapes come back. Before activation: the gift plus suggested tasks,
 * generated from the occasion and *not* persisted — a recipient who reads this
 * and closes the tab leaves nothing behind. After activation: the live page,
 * so re-opening the link is always safe and never offers to activate twice.
 */
router.get("/gifts/:redemptionToken/review", async (req, res) => {
  const { redemptionToken } = req.params;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, redemptionToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This gift link isn't valid." });
    return;
  }

  if (gift.pageId) {
    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, gift.pageId),
    });

    // The page is gone (closed and deleted) but the gift record remains. Treat
    // it as activated rather than inviting them to activate into nothing.
    if (page) {
      // The recipient's own management grant, so re-opening the gift link can
      // hand them back into /manage to add people and send invites.
      const grant = await db.query.pageGrantsTable.findFirst({
        where: eq(pageGrantsTable.pageId, page.id),
      });
      res.json({
        activated: true,
        recipientName: gift.recipientName,
        slug: page.slug,
        status: page.status,
        scheduledActivateAt: page.scheduledActivateAt?.toISOString() ?? null,
        manageToken: grant?.token ?? null,
        suggestions: [],
      });
      return;
    }
  }

  res.json({
    activated: false,
    recipientName: gift.recipientName,
    giftedBy: gift.purchaserName,
    occasion: gift.occasion ?? null,
    // The default situation line for this occasion, prefilled into the
    // activation UI where the recipient can keep or tweak it (a placeholder
    // wording for now — see inviteCopy.ts).
    situationLine: defaultSituationLine(gift.occasion ?? null),
    // Prefill the "where should we reach you?" field with the email we already
    // hold from the gift, if any. Null when we hold none (self-setup, future
    // physical-card gifts) — activation asks for it rather than assuming.
    recipientEmail: gift.recipientEmail ?? null,
    canActivate: ACTIVATABLE.includes(gift.status),
    slug: null,
    status: null,
    scheduledActivateAt: null,
    manageToken: null,
    suggestions: suggestionsFor(gift.occasion ?? null).map((t: SuggestedTask) => ({
      key: t.key,
      slotType: t.slotType,
      label: t.label,
      dated: t.dated,
      trustedHelpersOnly: t.trustedHelpersOnly,
    })),
  });
});

/**
 * POST /api/gifts/:redemptionToken/activate — "Make it live".
 *
 * The one required moment in the whole flow. Everything the recipient did
 * before this (keeping, killing, tweaking) lived in the browser; this is where
 * it becomes a support page.
 *
 * The page is created with organiser_id null. That is not an oversight: the
 * recipient has no account and is never going to be asked for one, and the
 * column is nullable precisely so a page can belong to a person rather than a
 * login.
 */
router.post("/gifts/:redemptionToken/activate", async (req, res) => {
  const { redemptionToken } = req.params;
  const body = req.body as Record<string, unknown>;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, redemptionToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This gift link isn't valid." });
    return;
  }

  // Re-opening a used link is safe and silent: hand back the page that already
  // exists rather than an error the recipient did nothing to deserve.
  if (gift.pageId) {
    const existing = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, gift.pageId),
    });
    if (existing) {
      const grant = await db.query.pageGrantsTable.findFirst({
        where: eq(pageGrantsTable.pageId, existing.id),
      });
      res.json({
        slug: existing.slug,
        status: existing.status,
        scheduledActivateAt: existing.scheduledActivateAt?.toISOString() ?? null,
        manageToken: grant?.token ?? null,
      });
      return;
    }
  }

  if (!ACTIVATABLE.includes(gift.status)) {
    res.status(409).json({ error: "This gift isn't ready to be set up yet." });
    return;
  }

  // Optional: go live on a chosen date instead of now. The page and its tasks
  // are created either way — only visibility waits.
  const scheduledRaw = trimmed(body.scheduledActivateAt);
  let scheduledActivateAt: Date | null = null;
  if (scheduledRaw) {
    const parsed = new Date(scheduledRaw);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "That date doesn't look right." });
      return;
    }
    // A date already past means "now" — no point creating a draft the sweep
    // would flip on its next run anyway.
    if (parsed.getTime() > Date.now()) scheduledActivateAt = parsed;
  }

  // Optional free-text note shown to every helper. Trimmed and capped like a
  // task's notes; empty becomes null so no "good to know" card is rendered.
  const goodToKnow = trimmed(body.goodToKnow).slice(0, 500) || null;

  // Where to reach the recipient about their own page — captured here so the
  // Item 8 claim notifications are deliverable. Prefilled from the gift in the
  // UI but sent explicitly, so a recipient with no gift email (self-setup,
  // physical-card gifts) can supply one. Both optional: skip and notifications
  // simply don't fire until an email is added via /manage. An email that
  // doesn't look like one is rejected rather than silently stored unusable.
  const recipientEmailRaw = trimmed(body.recipientEmail);
  if (recipientEmailRaw && !isEmail(recipientEmailRaw)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }
  const recipientEmail = recipientEmailRaw || null;
  const recipientMobile = trimmed(body.recipientMobile).slice(0, 40) || null;

  // Pronoun + situation line power the helper-invite copy sent in Item 5/6.
  // Occasion is carried from the gift; the situation line defaults from it and
  // is editable. Pronouns default to they/them when not supplied.
  const recipientPronouns = asPronouns(body.recipientPronouns);
  const situationLine =
    trimmed(body.situationLine).slice(0, 120) ||
    defaultSituationLine(gift.occasion ?? null);

  const tasksRaw = Array.isArray(body.tasks) ? body.tasks : [];
  const tasks = tasksRaw
    .map((raw) => {
      const t = raw as Record<string, unknown>;
      const slotType = asSlotType(t.slotType);
      const label = trimmed(t.label);
      if (!slotType || !label) return null;

      // Sensitivity is the recipient's to raise; ALWAYS_TRUSTED types cannot
      // be lowered below trusted even by a hand-crafted request.
      const trustedHelpersOnly =
        ALWAYS_TRUSTED.includes(slotType) || t.trustedHelpersOnly === true;

      return {
        slotType,
        // The label carries the recipient's own wording, so it goes in
        // customLabel for every type — the live page shows what they wrote,
        // not a generic enum name.
        customLabel: label.slice(0, 120),
        slotDate: asSlotDate(t.slotDate),
        notes: trimmed(t.notes).slice(0, 500) || null,
        trustedHelpersOnly,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    // A generous ceiling — enough for any real page, low enough that a scripted
    // request cannot bulk-insert through this unauthenticated endpoint.
    .slice(0, 50);

  const slug = await uniqueSlug();
  // The private management token for the recipient's own grant — the re-entry
  // credential. Not the public slug and not the gift redemption token.
  const manageToken = crypto.randomBytes(32).toString("hex");

  const page = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(supportPagesTable)
      .values({
        slug,
        // No account, by design. See the note above.
        organiserId: null,
        recipientName: gift.recipientName,
        // Fall back to the gift's email when the client sent none, so a plain
        // "activate" still wires up notifications for the common gift path.
        recipientEmail: recipientEmail ?? gift.recipientEmail ?? null,
        recipientMobile,
        status: scheduledActivateAt ? "draft" : "active",
        scheduledActivateAt,
        goodToKnow,
        privacy: "open",
        // Carried from the gift; power the invite copy in Item 5/6.
        occasion: gift.occasion ?? null,
        recipientPronouns,
        situationLine,
      })
      .returning();

    if (tasks.length > 0) {
      await tx.insert(slotsTable).values(
        tasks.map((t) => ({
          pageId: created.id,
          slotType: t.slotType,
          customLabel: t.customLabel,
          // Null is the common case: a flexible offer, dated when claimed.
          slotDate: t.slotDate,
          notes: t.notes,
          trustedHelpersOnly: t.trustedHelpersOnly,
        })),
      );
    }

    // Mint the recipient's own management grant so they can return to add
    // people and send invites — no account, ever.
    await tx.insert(pageGrantsTable).values({
      pageId: created.id,
      token: manageToken,
      role: "recipient",
    });

    await tx
      .update(giftsTable)
      .set({
        pageId: created.id,
        status: "redeemed",
        redeemedAt: new Date(),
      })
      .where(eq(giftsTable.id, gift.id));

    return created;
  });

  res.status(201).json({
    slug: page.slug,
    status: page.status,
    scheduledActivateAt: page.scheduledActivateAt?.toISOString() ?? null,
    manageToken,
  });
});

export default router;
