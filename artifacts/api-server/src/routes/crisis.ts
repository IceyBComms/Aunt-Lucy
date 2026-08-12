import { Router, type IRouter, type Request } from "express";
import crypto from "crypto";
import {
  db,
  organisersTable,
  supportPagesTable,
  magicLinkTokensTable,
  sessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { uniqueSlug } from "../lib/slug";
import { sendMagicLink, sendCrisisPageSaved } from "../lib/email";
import { getAppBaseUrl } from "../lib/appUrl";
import { hitRateLimit } from "../lib/rateLimit";
import { logger } from "../lib/logger";
import { grantRecipientAccess } from "../lib/accessGrants";
import type { Occasion } from "../lib/occasion";

const router: IRouter = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * The free crisis path (Item 14). This is NOT the paid flow: no gift row, no
 * Stripe object, no gift-flavoured email is ever created here. A crisis page is
 * an ordinary support page marked origin='crisis_free', run through the exact
 * same setup/activation machinery as an organiser-built page.
 *
 * The three warm entry choices map onto the existing occasion vocabulary, so the
 * invite copy, situation lines and bereavement handling all work unchanged — no
 * new occasion enum value is needed. Labels are the recipient's; keys are ours.
 */
const CRISIS_OCCASIONS: Record<string, Occasion> = {
  // "Someone has died"
  bereavement: "bereavement",
  // "A sudden illness or injury"
  illness_injury: "illness_recovery",
  // "Another hard time that arrived without warning"
  other_hardship: "other",
};

// Light-touch abuse guardrail (brief: "basic rate limiting ... nothing
// heavier"). A trip means "slow down", never a denial of help.
const EMAIL_LIMIT = 3;
const IP_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Best-effort client IP behind a proxy, for the light-touch per-IP limit. */
function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

// POST /api/crisis/pages — create a free crisis support page and get the setup
// person into the existing setup flow (public; no auth required to start).
router.post("/crisis/pages", async (req, res) => {
  const { name, email, occasion } = req.body as {
    name?: string;
    email?: string;
    occasion?: string;
  };

  const nameTrimmed = typeof name === "string" ? name.trim() : "";
  if (!nameTrimmed) {
    res.status(400).json({ error: "A name is required." });
    return;
  }

  const emailTrimmed =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const mappedOccasion =
    typeof occasion === "string" ? CRISIS_OCCASIONS[occasion] : undefined;
  if (!mappedOccasion) {
    res.status(400).json({ error: "Please choose what's happened." });
    return;
  }

  // Light-touch rate limit: per email AND per IP. Either tripping is a soft slow
  // down (429), not a block — Aunt Lucy never refuses a person in crisis.
  const emailHit = hitRateLimit(
    `crisis:email:${emailTrimmed}`,
    EMAIL_LIMIT,
    WINDOW_MS,
  );
  const ipHit = hitRateLimit(`crisis:ip:${clientIp(req)}`, IP_LIMIT, WINDOW_MS);
  if (emailHit.limited || ipHit.limited) {
    const retryAfterMs = Math.max(emailHit.retryAfterMs, ipHit.retryAfterMs);
    res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
    res.status(429).json({
      error:
        "That's a few goes in quick succession, so we've paused things for a minute. Nothing's lost — take a breath and try again shortly.",
    });
    return;
  }

  // Find or create the organiser (same passwordless account model as the
  // magic-link flow). A brand-new organiser has no pages to expose, so we can
  // safely drop them straight into setup with an immediate session. An email
  // that already owns pages gets a magic link instead, so nobody can walk into
  // an existing account just by typing its address.
  let organiser = await db.query.organisersTable.findFirst({
    where: eq(organisersTable.email, emailTrimmed),
  });

  let hasExistingPages = false;
  if (!organiser) {
    const [created] = await db
      .insert(organisersTable)
      .values({ email: emailTrimmed })
      .returning();
    organiser = created;
  } else {
    const existing = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.organiserId, organiser.id),
      columns: { id: true },
    });
    hasExistingPages = !!existing;
  }

  // Create the page up front so the occasion is captured either way. Draft +
  // invisible at /s/:slug until the setup person activates — exactly like a
  // gift the recipient hasn't activated yet.
  const slug = await uniqueSlug();
  const [page] = await db
    .insert(supportPagesTable)
    .values({
      slug,
      organiserId: organiser.id,
      recipientName: nameTrimmed,
      occasion: mappedOccasion,
      origin: "crisis_free",
      status: "draft",
    })
    .returning();

  // Section E — the affected person's own always-on access ("nothing about them
  // without them"). Optional at setup, and only acted on when the setup person
  // both has their contact AND says they're ready to be looped in. When not
  // ready — or left blank — we persist nothing and send nothing (per the locked
  // Option 1 decision); the /manage nudge invites completing it later. Both
  // outcomes are logged so we can size how often a deferred setup is ever
  // completed, and decide later whether pending-contact storage is worth a
  // migration. Grep event=recipient_access_deferred vs recipient_access_looped_in.
  const recipientContact =
    typeof (req.body as any)?.recipientContact === "string"
      ? (req.body as any).recipientContact.trim()
      : "";
  const recipientReady = (req.body as any)?.recipientReady === true;
  const contactLooksValid =
    !!recipientContact &&
    (recipientContact.includes("@")
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientContact)
      : /\d/.test(recipientContact));

  if (recipientContact && recipientReady && contactLooksValid) {
    await grantRecipientAccess({
      pageId: page.id,
      recipientName: nameTrimmed,
      contact: recipientContact,
    });
    logger.info(
      { event: "recipient_access_looped_in", pageId: page.id, source: "crisis_setup" },
      "Recipient given their own access at crisis setup",
    );
  } else {
    logger.info(
      { event: "recipient_access_deferred", pageId: page.id, flow: "crisis" },
      "Recipient's own access deferred at crisis setup (not ready or blank)",
    );
  }

  if (!hasExistingPages) {
    // Frictionless: issue a session and send them straight into setup. The
    // session lasts 30 days — the same lifetime as a standard magic-link
    // sign-in (see routes/auth.ts) — so a crisis organiser is never quietly
    // logged out mid-crisis on the device they set things up on.
    const sessionToken = generateToken();
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({
      organiserId: organiser.id,
      token: sessionToken,
      expiresAt: sessionExpiresAt,
    });

    // The ONE unprompted email a crisis page ever sends: a plain "keep this
    // link" bookmark so they can get back to their page from any device. Fired
    // ONLY here (frictionless creation), never on the magic-link fallback (that
    // path already sends a sign-in link). Fire-and-forget: an email hiccup must
    // never fail the page for someone in crisis. No activation nudge is ever
    // queued — crisis pages create no gift_messages, so the dispatcher that
    // sends nudges never sees them.
    sendCrisisPageSaved({
      to: emailTrimmed,
      name: nameTrimmed,
      pageLink: `${getAppBaseUrl()}/organise/dashboard`,
    }).catch((err) => {
      logger.error(
        { err, pageId: page.id },
        "Crisis page-saved email failed (page still created)",
      );
    });

    logger.info(
      { pageId: page.id, occasion: mappedOccasion },
      "Crisis page created (frictionless session)",
    );
    res.status(201).json({
      mode: "session",
      sessionToken,
      pageId: page.id,
      slug: page.slug,
    });
    return;
  }

  // Safe fallback: the email already has an account, so verify ownership via a
  // magic link before handing over any session. The page is waiting on their
  // dashboard once they sign in.
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(magicLinkTokensTable).values({
    organiserId: organiser.id,
    token,
    expiresAt,
  });

  const magicLink = `${getAppBaseUrl()}/organise/verify?token=${token}`;
  try {
    await sendMagicLink({ to: emailTrimmed, magicLink });
  } catch (err) {
    logger.error(
      { err, email: emailTrimmed },
      "Crisis page created but magic link failed to send",
    );
    res.status(503).json({
      error:
        "We're having trouble sending emails right now. Please try again in a few minutes.",
    });
    return;
  }

  logger.info(
    { pageId: page.id, occasion: mappedOccasion },
    "Crisis page created (magic-link fallback for existing account)",
  );
  res.status(201).json({ mode: "magic_link", email: emailTrimmed });
});

export default router;
