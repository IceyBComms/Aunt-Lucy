import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, giftsTable, giftSigningsTable, supportPagesTable, slotsTable, pageGrantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { suggestionsFor, type SuggestedTask } from "../lib/occasionSuggestions";
import { uniqueSlug } from "../lib/slug";
import { defaultSituationLine, type RecipientPronouns } from "../lib/inviteCopy";

const router: IRouter = Router();

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
  const signings = await db.query.giftSigningsTable.findMany({
    where: eq(giftSigningsTable.giftId, gift.id),
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
