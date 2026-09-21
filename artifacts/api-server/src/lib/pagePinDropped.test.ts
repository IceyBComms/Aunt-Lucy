/**
 * The page PIN is gone (Kate's ruling, 21 September 2026, bug #129).
 *
 * The one thing that had to be proved here is not that a new page is open —
 * that is easy and nearly free. It is that a page whose row STILL SAYS
 * `privacy = 'pin_protected'` opens, and can be claimed on, WITHOUT ANY DATA
 * CHANGE. Production holds such rows (the live Pookey page was one), this PR
 * ships no migration, and a hashed PIN cannot be recovered by anyone — so if
 * those rows did not open on their own, the ruling would not actually have
 * been carried out.
 *
 * These run the REAL routers over real HTTP against a fake database, so the
 * checks that remain (not found → closed → not active → trusted-only) run in
 * their real order rather than being described by a test. What the fake does
 * NOT exercise, stated plainly: Drizzle itself — the `where` clauses are built
 * and thrown away, so a wrong column in a query would pass here.
 *
 * ⚠️ P2. The absence claims ("no 401", "no pinRequired") would pass for free
 * against a route that answered nothing at all, so each sits beside a positive
 * control from the SAME response — the page's real content, the written claim.
 * The sabotage log at the bottom records what was broken to prove they bite.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// @workspace/db throws at import when DATABASE_URL is missing, and the mock
// below spreads the real module to get the real table objects (so the routes'
// real `eq(slotsTable.pageId, …)` is built from real columns). Nothing ever
// connects: the fake `db` answers every query.
process.env.DATABASE_URL ??= "postgres://unused:unused@localhost:5432/unused";

type Row = Record<string, unknown>;

/** What the fake database will answer with, reset before every test. */
let pageRow: Row | null;
let slotRows: Row[];
/** Everything the routes tried to WRITE, so a claim can be proved to land. */
let updates: Row[];
let inserts: Row[];

/** A thenable that resolves to `rows` however far the builder chain is taken. */
function chain(rows: () => unknown[]): any {
  const self: any = {
    from: () => self,
    innerJoin: () => self,
    leftJoin: () => self,
    where: () => self,
    limit: () => self,
    orderBy: () => self,
    set: (values: Row) => {
      updates.push(values);
      return self;
    },
    values: (values: Row) => {
      inserts.push(values);
      return self;
    },
    returning: () => self,
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
  };
  return self;
}

vi.mock("@workspace/db", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      query: {
        supportPagesTable: { findFirst: async () => pageRow ?? undefined },
        slotsTable: {
          // routes/pages.ts filters trusted-only tasks IN THE QUERY, so the
          // fake has to honour that or the filtering test would be theatre.
          findMany: async () => slotRows.filter((s) => s.trustedHelpersOnly !== true),
        },
      },
      select: () =>
        chain(() =>
          slotRows
            .filter((s) => s.id === claimingSlotId)
            .map((slot) => ({ slot, page: pageRow })),
        ),
      update: () =>
        chain(() => {
          const slot = slotRows.find((s) => s.id === claimingSlotId);
          if (!slot || slot.isClaimed === true) return [];
          return [{ ...slot, ...updates[updates.length - 1], isClaimed: true }];
        }),
      insert: () => chain(() => [{ ...inserts[inserts.length - 1], id: "page-new", createdAt: new Date() }]),
    },
  };
});

/** Which slot the current claim request is for — set by the helper below. */
let claimingSlotId = "";

// The claim route's side effects: a confirmation to the helper, and the
// recipient's notification. Neither is what this file is about.
vi.mock("./claimNotify", () => ({ sendClaimConfirmationToHelper: vi.fn(async () => undefined) }));
vi.mock("./item17Notify", () => ({
  notifyRecipientOfTaskEvent: vi.fn(async () => undefined),
  shareLinkFor: () => "https://example.test/s/legacy-pin-page",
}));

const { default: pagesRouter } = await import("../routes/pages");
const { default: slotsRouter } = await import("../routes/slots");
const { applyBodyParsers, createErrorHandler } = await import("./requestHygiene");
const { CLOSED_PAGE_MESSAGE } = await import("./pageClosureCopy");

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  applyBodyParsers(app);
  app.use(pagesRouter);
  app.use(slotsRouter);
  app.use(createErrorHandler({ error: () => undefined }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * The page at the heart of this: ACTIVE, and still flagged pin_protected with
 * a bcrypt hash in `pin` — exactly the shape of a row already in production.
 */
const LEGACY_PIN_PAGE: Row = {
  id: "page-legacy",
  slug: "legacy-pin-page",
  recipientName: "Pookey",
  situationDescription: "A new baby.",
  location: "Fitzroy, Melbourne",
  status: "active",
  privacy: "pin_protected",
  pin: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS",
  goodToKnow: null,
};

function openSlot(over: Row = {}): Row {
  return {
    id: "slot-open",
    pageId: "page-legacy",
    slotType: "meal",
    customLabel: null,
    slotDate: "2026-09-30",
    slotTime: "18:00",
    liftWaitMode: null,
    notes: "No allergies.",
    dietaryNotes: null,
    headcount: null,
    flexibility: "flexible",
    isClaimed: false,
    claimedByName: null,
    claimedByContact: null,
    claimedNote: null,
    claimedNameVisible: false,
    trustedHelpersOnly: false,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  pageRow = { ...LEGACY_PIN_PAGE };
  slotRows = [
    openSlot(),
    openSlot({ id: "slot-trusted", slotType: "child_care", trustedHelpersOnly: true }),
  ];
  updates = [];
  inserts = [];
  claimingSlotId = "";
});

afterEach(() => {
  vi.clearAllMocks();
});

async function getPage(slug = "legacy-pin-page") {
  const res = await fetch(`${base}/pages/${slug}`);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function claim(slotId: string, body: Record<string, unknown> = {}) {
  claimingSlotId = slotId;
  const res = await fetch(`${base}/slots/${slotId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstName: "Jo", contact: "jo@example.com", ...body }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

// ─── A page still flagged pin_protected just opens ───────────────────────────

describe("an existing pin_protected page opens with no PIN and no data change", () => {
  it("GET /pages/:slug returns the page itself, not a demand for a code", async () => {
    const { status, body } = await getPage();

    // Positive control first: this is the real page, not an empty 200.
    expect(status).toBe(200);
    expect(body.recipientName).toBe("Pookey");
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].id).toBe("slot-open");

    // And the absences, in the same response.
    expect(status).not.toBe(401);
    expect(body.pinRequired).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("PIN");
  });

  it("the row is untouched — nothing rewrites privacy or clears the hash", async () => {
    await getPage();
    // No migration ships with this PR and the route must not quietly become
    // one. The page opens because nothing reads the flag, not because the
    // flag was changed.
    expect(updates).toEqual([]);
    expect(pageRow?.privacy).toBe("pin_protected");
    expect(pageRow?.pin).toBe(LEGACY_PIN_PAGE.pin);
  });

  it("a ?pin= query string changes nothing — right, wrong or absent", async () => {
    const withPin = await fetch(`${base}/pages/legacy-pin-page?pin=9999`);
    const without = await getPage();
    expect(withPin.status).toBe(200);
    expect(((await withPin.json()) as any).recipientName).toBe(without.body.recipientName);
  });

  it("a helper can claim a task on it, sending no pin at all", async () => {
    const { status, body } = await claim("slot-open");

    expect(status).toBe(200);
    expect(body.id).toBe("slot-open");
    expect(body.isClaimed).toBe(true);
    // The write really happened — a 200 with nothing written would be a lie.
    expect(updates).toHaveLength(1);
    expect(updates[0].claimedByName).toBe("Jo");
    expect(updates[0].claimedByContact).toBe("jo@example.com");
  });

  it("a claim that still SENDS a pin is not refused either — old bundles keep working", async () => {
    // A helper with a cached page after deploy sends `pin` in the body. The
    // field is ignored, never rejected, and never stored.
    const { status } = await claim("slot-open", { pin: "1234" });
    expect(status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0])).not.toContain("pin");
  });
});

// ─── The checks that REMAIN, in their order ──────────────────────────────────

describe("removing the PIN gate did not disturb the checks around it", () => {
  it("a closed page still says closed, even with the old pin_protected flag", async () => {
    pageRow = { ...LEGACY_PIN_PAGE, status: "closed" };
    const { status, body } = await getPage();
    expect(status).toBe(404);
    expect(body.error).toBe(CLOSED_PAGE_MESSAGE);
  });

  it("a page that isn't live yet still says so, with the same flag", async () => {
    pageRow = { ...LEGACY_PIN_PAGE, status: "draft" };
    const { status, body } = await getPage();
    expect(status).toBe(404);
    expect(body.error).toBe("This support page isn't available yet.");
  });

  it("an unknown slug still gets the doesn't-exist message", async () => {
    pageRow = null;
    const { status, body } = await getPage("no-such-page");
    expect(status).toBe(404);
    expect(body.error).toBe("This support page doesn't exist or has been removed.");
  });

  it("a trusted-only task is still absent from the public page", async () => {
    const { body } = await getPage();
    // Positive control in the same response: the open task IS there, so this
    // isn't an empty list passing for free.
    expect(body.slots.map((s: any) => s.id)).toEqual(["slot-open"]);
  });

  it("a trusted-only task still can't be claimed through the public door", async () => {
    const { status, body } = await claim("slot-trusted");
    expect(status).toBe(404);
    expect(body.error).toBe("This slot doesn't exist.");
    expect(updates).toEqual([]);
  });

  it("a claim on a page that isn't active is still refused", async () => {
    pageRow = { ...LEGACY_PIN_PAGE, status: "closed" };
    const { status } = await claim("slot-open");
    expect(status).toBe(404);
    expect(updates).toEqual([]);
  });
});

// ─── Nothing can create a PIN page any more ──────────────────────────────────

describe("the create route ignores privacy and pin rather than refusing them", () => {
  it("privacy: pin_protected + a pin produces an OPEN page, and no error", async () => {
    // routes/organiser.ts is behind requireAuth and pulls in half the server,
    // so rather than stand it up, this reads the route as text. It is a weaker
    // check than the HTTP ones above and is written as such.
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../routes/organiser.ts"),
      "utf8",
    );
    const create = source.slice(
      source.indexOf('router.post("/organiser/pages"'),
      source.indexOf('router.post("/organiser/pages/:pageId/slots"'),
    );
    expect(create.length).toBeGreaterThan(0);

    // It writes open, always — one line, no conditional on it.
    expect(create).toContain('privacy: "open" as const,');
    expect(create).toContain("pin: null,");
    // It no longer reads either field from the body, so an old client sending
    // them cannot be refused: there is no branch left to refuse from.
    expect(create).not.toContain("hashPin");
    expect(create).not.toContain('privacy === "pin_protected"');
    expect(create).not.toContain("digit PIN is required");
  });
});

// ─── The gate is gone from the source, not merely unreachable ────────────────

describe("no PIN machinery is left anywhere in the server", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

  it("lib/pin.ts no longer exists", () => {
    expect(fs.existsSync(path.resolve(import.meta.dirname, "./pin.ts"))).toBe(false);
  });

  it("no route imports verifyPin or hashPin", () => {
    for (const file of ["../routes/pages.ts", "../routes/slots.ts", "../routes/organiser.ts"]) {
      const source = read(file);
      expect(source).not.toContain("verifyPin");
      expect(source).not.toContain("hashPin");
      expect(source).not.toContain('from "../lib/pin"');
    }
  });

  it("neither route can answer 401 with pinRequired any more", () => {
    for (const file of ["../routes/pages.ts", "../routes/slots.ts"]) {
      expect(read(file)).not.toContain("pinRequired");
    }
  });

  it("the OpenAPI spec no longer carries the pin param or PinRequiredError", () => {
    const spec = read("../../../../lib/api-spec/openapi.yaml");
    expect(spec).not.toContain("PinRequiredError");
    expect(spec).not.toContain("- name: pin");
    // The enum value survives on purpose — the column still exists — so this
    // asserts the removal, not a blanket absence of the word.
    expect(spec).toContain("enum: [open, pin_protected]");
  });

  it("rally's public page no longer asks anyone for a code", () => {
    const page = read("../../../rally/src/pages/SupportPage.tsx");
    // The screen itself, not the word: a comment in that file still NAMES
    // the removed screen so the next reader knows it existed and why it
    // went. These are the things only the live screen had.
    expect(page).not.toContain("if (needsPin)");
    expect(page).not.toContain("submitPin");
    expect(page).not.toContain('id="pin"');
    expect(page).not.toContain("Your code");
    // Positive control: the branches that SHOULD still be there are.
    expect(page).toContain("if (closed) {");
    expect(page).toContain("if (notLiveYet) {");
  });
});

/*
 * ─── SABOTAGE LOG (P2) ──────────────────────────────────────────────────────
 *
 * Each assertion above was proved load-bearing by breaking the thing it
 * guards and watching it go red. Run on 21 September 2026.
 *
 * 1. Put the PIN gate back in routes/pages.ts (the `page.privacy ===
 *    "pin_protected"` 401, with a local verifyPin).
 *    → "returns the page itself" RED (expected 200, got 401), "?pin= changes
 *      nothing" RED, "trusted-only task is still absent" RED. The closed and
 *      not-live tests stayed GREEN, which is correct: they sit ABOVE the gate
 *      and prove the order was kept.
 *
 * 2. Put the claim gate back in routes/slots.ts.
 *    → "a helper can claim a task on it" RED (401, nothing written).
 *
 * 3. Made routes/organiser.ts write `privacy: privacy === "pin_protected" ?
 *    "pin_protected" : "open"` again.
 *    → "produces an OPEN page" RED.
 *
 * Recorded in full in the PR report.
 */
