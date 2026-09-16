/**
 * App-wide request hygiene: an empty request is `{}`, and no credential in a
 * path reaches the logs. See lib/requestHygiene.ts for why each exists.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  applyBodyParsers,
  createErrorHandler,
  logSafePath,
  SECRET_PATH_PARAMS,
} from "./requestHygiene";

const SECRET = "SeCrEtToKeN0123456789abcdef";

let logged: object[];
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  applyBodyParsers(app);
  const router = express.Router();
  // Written the way the invite claim was: destructure straight off req.body.
  router.post("/echo", (req, res) => {
    const { flag } = req.body as { flag?: boolean };
    res.json({ ok: true, flag: flag ?? null });
  });
  router.post("/invite/:token/claim", () => {
    throw new Error("boom");
  });
  app.use("/api", router);
  app.use(createErrorHandler({ error: (obj) => logged.push(obj) }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  logged = [];
});

describe("an empty request arrives as {}", () => {
  it("a bodiless POST reaches a handler that destructures req.body", async () => {
    const res = await fetch(`${base}/echo`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, flag: null });
  });

  it("a real body still arrives — positive control for the parsers", async () => {
    const res = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag: true }),
    });
    expect(await res.json()).toEqual({ ok: true, flag: true });
  });
});

describe("the error handler never logs a path token", () => {
  it("logs the failure, with the invite token redacted", async () => {
    const res = await fetch(`${base}/invite/${SECRET}/claim?x=1`, { method: "POST" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong." });

    // Positive control: the handler DID log this request.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ method: "POST", url: "/api/invite/:redacted/claim" });
    expect(JSON.stringify(logged)).not.toContain(SECRET);
  });
});

describe("logSafePath", () => {
  it.each([
    [`/api/invite/${SECRET}`, "/api/invite/:redacted"],
    [`/api/invite/${SECRET}/claim`, "/api/invite/:redacted/claim"],
    [`/api/manage/${SECRET}/tasks/slot-1`, "/api/manage/:redacted/tasks/slot-1"],
    [`/api/slots/release/${SECRET}`, "/api/slots/release/:redacted"],
    [`/api/calendar/${SECRET}.ics`, "/api/calendar/:redacted"],
    [`/api/pages/${SECRET}?pin=1234`, "/api/pages/:redacted"],
  ])("%s → %s", (input, expected) => {
    expect(logSafePath(input)).toBe(expected);
  });

  it("redacts /unsubscribe/:contactId, which acts on the id alone", () => {
    expect(logSafePath(`/api/unsubscribe/${SECRET}`)).toBe("/api/unsubscribe/:redacted");
  });

  it("leaves non-credential paths readable", () => {
    expect(logSafePath("/api/organiser/pages/page-1/slots")).toBe("/api/organiser/pages/page-1/slots");
    expect(logSafePath("/api/slots/slot-1/claim")).toBe("/api/slots/slot-1/claim");
    expect(logSafePath("/api/gifts")).toBe("/api/gifts");
    expect(logSafePath("/api/healthz")).toBe("/api/healthz");
  });
});

describe("every route with a credential in its path is redacted (drift guard)", () => {
  const routesDir = path.resolve(__dirname, "../routes");
  const libDir = __dirname;
  const files = [
    ...fs.readdirSync(routesDir).map((f) => path.join(routesDir, f)),
    ...fs.readdirSync(libDir).map((f) => path.join(libDir, f)),
  ].filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  const secretParam = new RegExp(`:(${SECRET_PATH_PARAMS.join("|")})\\b`);
  const routePaths = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const m of source.matchAll(/\b(?:router|app)\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      if (secretParam.test(m[1])) routePaths.add(m[1]);
    }
  }

  it("finds the token routes it is guarding — positive control", () => {
    expect(routePaths).toContain("/invite/:token/claim");
    expect(routePaths).toContain("/manage/:token");
    expect(routePaths.size).toBeGreaterThan(15);
  });

  it("redacts every one of them", () => {
    const leaks = [...routePaths].filter((route) => {
      // Only the credential gets the secret value; other ids stay plain.
      const concrete = `/api${route.replace(/:([A-Za-z]+)/g, (_m, name: string) =>
        (SECRET_PATH_PARAMS as readonly string[]).includes(name) ? SECRET : "some-id",
      )}`;
      return (logSafePath(concrete) ?? "").includes(SECRET);
    });
    expect(leaks).toEqual([]);
  });
});

describe("app.ts uses these, not its own copies", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "../app.ts"), "utf8");

  it("wires the body parsers, the error handler and the request-log redaction", () => {
    expect(appSource).toContain("applyBodyParsers(app);");
    expect(appSource).toContain("app.use(createErrorHandler(logger));");
    expect(appSource).toMatch(/url: logSafePath\(/);
  });

  it("has no path logging that skips redaction", () => {
    expect(appSource).not.toContain('split("?")');
    expect(appSource).not.toMatch(/app\.use\(express\.(json|urlencoded)\(/);
  });
});
