/**
 * Magic-link sign-in — a GET must look at the token, never spend it.
 *
 * Three layers, because the bug could come back through any of them:
 *   1. classifyMagicToken, the pure decision, tested directly.
 *   2. The real Express routes over HTTP, against an in-memory store. The
 *      central test is an ABSENCE claim ("the GET did not consume"), which a
 *      request that never reached the route would pass for free — so the same
 *      test also proves the GET landed: 200 AND a body only the valid branch
 *      produces.
 *   3. The frontend page, read as source: the POST must sit behind the button,
 *      not in the effect that runs when the page loads. A scanner that runs
 *      JavaScript would otherwise spend the token just as before.
 *
 * WHAT THIS DOES NOT CATCH, STATED PLAINLY: the store here is in-memory. The
 * Drizzle store in routes/auth.ts (in particular markUsed's `used_at IS NULL`
 * guard) is not exercised by these tests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  classifyMagicToken,
  createMagicLinkVerifyRouter,
  MAGIC_LINK_REJECTED,
  type MagicLinkStore,
  type MagicTokenRow,
} from "./magicLinkVerify";

const NOW = new Date("2026-09-14T09:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("classifyMagicToken — the decision, with no database", () => {
  const fresh = { expiresAt: minutes(50), usedAt: null };

  it("an unused token inside its hour is valid", () => {
    expect(classifyMagicToken(fresh, NOW)).toBe("valid");
  });

  it("no row at all is unknown", () => {
    expect(classifyMagicToken(null, NOW)).toBe("unknown");
    expect(classifyMagicToken(undefined, NOW)).toBe("unknown");
  });

  it("a stamped token is used", () => {
    expect(classifyMagicToken({ ...fresh, usedAt: minutes(-1) }, NOW)).toBe("used");
  });

  it("an unstamped token past its expiry is expired", () => {
    expect(classifyMagicToken({ expiresAt: minutes(-1), usedAt: null }, NOW)).toBe("expired");
  });

  it("expires AT expiresAt, not a moment after — matching the old `expires_at > now`", () => {
    expect(classifyMagicToken({ expiresAt: NOW, usedAt: null }, NOW)).toBe("expired");
    expect(classifyMagicToken({ expiresAt: new Date(NOW.getTime() + 1), usedAt: null }, NOW)).toBe("valid");
  });

  it("spent AND since expired reports used — the cause, not the aftermath", () => {
    expect(classifyMagicToken({ expiresAt: minutes(-5), usedAt: minutes(-50) }, NOW)).toBe("used");
  });
});

// ─── The routes, over real HTTP ─────────────────────────────────────────────

const TOKEN = "a".repeat(64);

let rows: (MagicTokenRow & { token: string })[];
let sessions: string[];
let logs: { obj: object; msg: string }[];

const store: MagicLinkStore = {
  async findByToken(token) {
    const row = rows.find((r) => r.token === token);
    return row ? { ...row } : null;
  },
  async markUsed(id, now) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.usedAt) return false;
    row.usedAt = now;
    return true;
  },
  async createSession(organiserId) {
    const sessionToken = `session-${sessions.length + 1}-${organiserId}`;
    sessions.push(sessionToken);
    return sessionToken;
  },
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createMagicLinkVerifyRouter(store, { warn: (obj, msg) => logs.push({ obj, msg }) }, () => NOW),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  rows = [
    {
      id: "row-1",
      organiserId: "org-1",
      token: TOKEN,
      createdAt: minutes(-2),
      expiresAt: minutes(58),
      usedAt: null,
    },
  ];
  sessions = [];
  logs = [];
});

const get = (token: string) => fetch(`${base}/auth/verify?token=${token}`);
const post = (token: string) =>
  fetch(`${base}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

describe("GET /auth/verify — looks, never spends", () => {
  it("lands on the confirm branch AND leaves usedAt null (positive control + absence, one run)", async () => {
    const res = await get(TOKEN);

    // (a) The GET actually reached the route and took the valid branch.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "valid" });

    // (b) …and spent nothing.
    expect(rows[0].usedAt).toBeNull();
    expect(sessions).toHaveLength(0);
  });

  it("GET, GET again, then POST succeeds once — and a second POST fails", async () => {
    const first = await get(TOKEN);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "valid" });

    const second = await get(TOKEN);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "valid" });
    expect(rows[0].usedAt).toBeNull();

    const signIn = await post(TOKEN);
    expect(signIn.status).toBe(200);
    expect(await signIn.json()).toEqual({ sessionToken: "session-1-org-1" });
    expect(rows[0].usedAt).toEqual(NOW);

    const again = await post(TOKEN);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: MAGIC_LINK_REJECTED });
    expect(sessions).toHaveLength(1);
  });

  it("is not cacheable — a shared cache must not replay the answer", async () => {
    const res = await get(TOKEN);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("rejections — logged by cause, never with the token", () => {
  it("logs `used` when a spent link is opened", async () => {
    await post(TOKEN);
    const res = await get(TOKEN);
    expect(res.status).toBe(401);
    expect(logs.at(-1)?.obj).toMatchObject({ classification: "used", method: "GET", usedSecondsAfterIssue: 120 });
  });

  it("logs `expired` for a link past its hour", async () => {
    rows[0].expiresAt = minutes(-3);
    const res = await post(TOKEN);
    expect(res.status).toBe(401);
    expect(logs.at(-1)?.obj).toMatchObject({ classification: "expired", method: "POST", secondsSinceExpiry: 180 });
    expect(rows[0].usedAt).toBeNull();
  });

  it("logs `unknown` for a token that was never issued", async () => {
    const res = await get("b".repeat(64));
    expect(res.status).toBe(401);
    expect(logs.at(-1)?.obj).toMatchObject({ classification: "unknown", method: "GET" });
  });

  it("the person-facing sentence is unchanged, whatever the cause", async () => {
    rows[0].expiresAt = minutes(-3);
    expect(await (await get(TOKEN)).json()).toEqual({
      error: "This link has expired or already been used. Please request a new one.",
    });
  });

  it("no log line carries the token, or any piece of it", async () => {
    await get("b".repeat(64));
    await post(TOKEN);
    await post(TOKEN);
    rows[0].usedAt = null;
    rows[0].expiresAt = minutes(-1);
    await get(TOKEN);

    expect(logs.length).toBeGreaterThanOrEqual(3);
    const everything = JSON.stringify(logs);
    expect(everything).not.toContain(TOKEN.slice(0, 16));
    expect(everything).not.toContain("b".repeat(16));
  });
});

// ─── The page: the POST lives behind the button ─────────────────────────────

describe("OrganiseVerify.tsx — loading the page does not sign in", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../rally/src/pages/OrganiseVerify.tsx"),
    "utf8",
  );
  const effect = source.match(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/)?.[1];
  const confirm = source.match(/async function confirmSignIn\(\) \{([\s\S]*?)\n {2}\}\n/)?.[1];

  it("finds the on-load effect and the button handler (or this test is reading the wrong shape)", () => {
    expect(effect).toBeTruthy();
    expect(confirm).toBeTruthy();
  });

  it("the on-load effect only checks — no POST, no sign-in", () => {
    expect(effect).toContain("/auth/verify?token=");
    expect(effect).not.toMatch(/POST/);
    expect(effect).not.toMatch(/signIn\(/);
  });

  it("the POST and the sign-in happen in the button's handler, and the button calls it", () => {
    expect(confirm).toMatch(/method:\s*"POST"/);
    expect(confirm).toMatch(/signIn\(sessionToken\)/);
    expect(source).toMatch(/onClick=\{confirmSignIn\}/);
    expect(source).toContain("Sign me in");
  });
});
