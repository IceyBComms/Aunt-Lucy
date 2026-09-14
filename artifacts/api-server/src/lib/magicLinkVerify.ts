/**
 * Magic-link sign-in: looking at a link is not the same as spending it.
 *
 * Until 14 September a plain GET /api/auth/verify both validated AND consumed
 * the token. Anything that fetched the link before the person did — a mail
 * scanner that runs the page's JavaScript, a Safe Links detonation, a browser
 * prefetch, an in-app browser that hands off to the real one — spent it, and
 * the person arrived second to be told the link was used. Kate hit exactly
 * that, minutes after the email arrived.
 *
 * The rule now:
 *   • GET  /auth/verify?token=…  validates only. It never writes.
 *   • POST /auth/verify {token}  is sent by the "Sign me in" button, and is the
 *                                only thing that stamps usedAt and hands out a
 *                                session. A scanner does not press buttons.
 *
 * Deciding lives in classifyMagicToken (pure — no database, no request, no
 * clock of its own). Doing lives in the router below, against a small store
 * interface, so the whole route can be exercised in a test with no database.
 * This file must not import @workspace/db for that reason.
 */
import { Router, type IRouter } from "express";

export type MagicTokenClass = "valid" | "expired" | "used" | "unknown";

export interface MagicTokenRow {
  id: string;
  organiserId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Everything that decides whether a token may be spent.
 *
 * "used" is checked before "expired": a token that was spent and has since run
 * out was, for diagnosis, SPENT — that is the cause worth seeing in the logs.
 * Valid means strictly before expiresAt, matching the old `expires_at > now`.
 */
export function classifyMagicToken(
  row: Pick<MagicTokenRow, "expiresAt" | "usedAt"> | null | undefined,
  now: Date,
): MagicTokenClass {
  if (!row) return "unknown";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/**
 * The person-facing rejection. Deliberately UNCHANGED — "expired" and "used"
 * still share one sentence here; the split is logged server-side only, and the
 * wording is Kate's call, not this fix's.
 */
export const MAGIC_LINK_REJECTED =
  "This link has expired or already been used. Please request a new one.";

export interface MagicLinkStore {
  findByToken(token: string): Promise<MagicTokenRow | null>;
  /**
   * Stamp usedAt ONLY if the token is still unused. Resolves true when this
   * call did the stamping, false when something else got there first — two
   * taps racing must not both come away with a session.
   */
  markUsed(id: string, now: Date): Promise<boolean>;
  /** Create a session for the organiser and return its token. */
  createSession(organiserId: string): Promise<string>;
}

export interface VerifyLog {
  warn(obj: object, msg: string): void;
}

/**
 * What a rejection logs. ⚠️ NEVER the token, and nothing derived from it —
 * a sign-in token in stdout is a sign-in. Classification plus timing is enough
 * to tell a scanner (used seconds after issue) from a slow human (expired).
 */
export function rejectionLogFields(
  classification: Exclude<MagicTokenClass, "valid">,
  method: "GET" | "POST",
  row: MagicTokenRow | null,
  now: Date,
): Record<string, string | number> {
  const fields: Record<string, string | number> = { classification, method };
  if (row && classification === "used" && row.usedAt) {
    fields.usedSecondsAfterIssue = Math.round((row.usedAt.getTime() - row.createdAt.getTime()) / 1000);
    fields.secondsSinceUsed = Math.round((now.getTime() - row.usedAt.getTime()) / 1000);
  }
  if (row && classification === "expired") {
    fields.secondsSinceExpiry = Math.round((now.getTime() - row.expiresAt.getTime()) / 1000);
  }
  return fields;
}

function readToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createMagicLinkVerifyRouter(
  store: MagicLinkStore,
  log: VerifyLog,
  clock: () => Date = () => new Date(),
): IRouter {
  const router: IRouter = Router();

  // GET /api/auth/verify?token=xxx — validate only. Must never write.
  router.get("/auth/verify", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = readToken(req.query.token);
    if (!token) {
      log.warn({ classification: "missing", method: "GET" }, "Magic link rejected");
      res.status(400).json({ error: "Token is required." });
      return;
    }

    const now = clock();
    const row = await store.findByToken(token);
    const classification = classifyMagicToken(row, now);

    if (classification !== "valid") {
      log.warn(rejectionLogFields(classification, "GET", row, now), "Magic link rejected");
      res.status(401).json({ error: MAGIC_LINK_REJECTED });
      return;
    }

    res.json({ status: "valid" });
  });

  // POST /api/auth/verify {token} — the "Sign me in" button. Spends the token.
  router.post("/auth/verify", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = readToken((req.body as { token?: unknown } | undefined)?.token);
    if (!token) {
      log.warn({ classification: "missing", method: "POST" }, "Magic link rejected");
      res.status(400).json({ error: "Token is required." });
      return;
    }

    const now = clock();
    const row = await store.findByToken(token);
    const classification = classifyMagicToken(row, now);

    if (classification !== "valid" || !row) {
      log.warn(
        rejectionLogFields(classification === "valid" ? "unknown" : classification, "POST", row, now),
        "Magic link rejected",
      );
      res.status(401).json({ error: MAGIC_LINK_REJECTED });
      return;
    }

    if (!(await store.markUsed(row.id, now))) {
      // Lost a race with another POST between the read and the stamp.
      log.warn({ classification: "used", method: "POST", race: 1 }, "Magic link rejected");
      res.status(401).json({ error: MAGIC_LINK_REJECTED });
      return;
    }

    const sessionToken = await store.createSession(row.organiserId);
    res.json({ sessionToken });
  });

  return router;
}
