import type { Request, Response, NextFunction } from "express";
import { db, sessionsTable, organisersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export interface AuthRequest extends Request {
  organiserId: string;
  organiserEmail: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const token = authHeader.slice(7);

  const [row] = await db
    .select({ session: sessionsTable, organiser: organisersTable })
    .from(sessionsTable)
    .innerJoin(organisersTable, eq(sessionsTable.organiserId, organisersTable.id))
    .where(
      and(
        eq(sessionsTable.token, token),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    return;
  }

  (req as AuthRequest).organiserId = row.organiser.id;
  (req as AuthRequest).organiserEmail = row.organiser.email;
  next();
}
