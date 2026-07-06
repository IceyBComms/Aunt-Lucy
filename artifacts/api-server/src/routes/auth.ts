import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, organisersTable, magicLinkTokensTable, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { sendMagicLink } from "../lib/email";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { getAppBaseUrl } from "../lib/appUrl";

const router: IRouter = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// POST /api/auth/magic-link
router.post("/auth/magic-link", async (req, res) => {
  const { email } = req.body as { email?: string };

  const emailTrimmed = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  // Find or create organiser
  let organiser = await db.query.organisersTable.findFirst({
    where: eq(organisersTable.email, emailTrimmed),
  });

  if (!organiser) {
    const [created] = await db
      .insert(organisersTable)
      .values({ email: emailTrimmed })
      .returning();
    organiser = created;
  }

  // Create magic link token (expires in 1 hour)
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
    logger.error({ err, email: emailTrimmed }, "Failed to send magic link — email delivery error");
    res.status(503).json({
      error: "We're having trouble sending emails right now. Please try again in a few minutes.",
    });
    return;
  }

  logger.info({ email: emailTrimmed }, "Magic link sent");

  res.json({ ok: true });
});

// GET /api/auth/verify?token=xxx
router.get("/auth/verify", async (req, res) => {
  const { token } = req.query as { token?: string };

  if (!token) {
    res.status(400).json({ error: "Token is required." });
    return;
  }

  const [row] = await db
    .select()
    .from(magicLinkTokensTable)
    .where(
      and(
        eq(magicLinkTokensTable.token, token),
        gt(magicLinkTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || row.usedAt) {
    res.status(401).json({ error: "This link has expired or already been used. Please request a new one." });
    return;
  }

  // Mark token as used
  await db
    .update(magicLinkTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(magicLinkTokensTable.id, row.id));

  // Create session (expires in 30 days)
  const sessionToken = generateToken();
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({
    organiserId: row.organiserId,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
  });

  res.json({ sessionToken });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth as any, (req, res) => {
  const authReq = req as AuthRequest;
  res.json({ id: authReq.organiserId, email: authReq.organiserEmail });
});

// POST /api/auth/logout
router.post("/auth/logout", requireAuth as any, async (req, res) => {
  const token = req.headers.authorization!.slice(7);
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.json({ ok: true });
});

export default router;
