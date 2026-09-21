/**
 * "Make changes", the free-page back door, and adding a task to a live page.
 * (Kate's ruling, 21 September 2026 — Parts A, B and C.)
 *
 * These run the REAL routers over real HTTP against a fake database, so the
 * checks that matter run in their real order — ownership before minting, the
 * closed-page 410 before the insert, the admin gate before the page row. What
 * the fake does NOT exercise, stated plainly: Drizzle itself. The `where`
 * clauses are built and thrown away, so a wrong COLUMN in a query would pass
 * here. What it does exercise is every decision the route makes.
 *
 * ⚠️ P2. The dangerous claims in this file are absences — "the recipient's
 * token is not in the response", "nothing was sent", "no second grant was
 * minted". Every one of them would pass for free against a route that answered
 * nothing at all, so each sits beside a positive control FROM THE SAME
 * RESPONSE: the url that was returned, the task that was created. The sabotage
 * log at the bottom records what was broken to prove each one bites.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// @workspace/db throws at import when DATABASE_URL is missing, and the mock
// below spreads the real module to get the real table objects (so the routes'
// real `eq(...)` is built from real columns). Nothing ever connects.
process.env.DATABASE_URL ??= "postgres://unused:unused@localhost:5432/unused";
process.env.APP_URL ??= "https://example.test";
process.env.ADMIN_EMAIL = "admin@auntlucy.com.au";

type Row = Record<string, unknown>;

// ─── What the fake database holds, reset before every test ───────────────────

/** The signed-in organiser, or null for a request with no valid session. */
let authOrganiser: Row | null;
/** The page GET /organiser/pages/:id/manage-link will find, or null for 404. */
let pageRow: Row | null;
/** Unrevoked grants on that page. */
let grantRows: Row[];
/** The grant + page the /manage token resolves to, or null for a 401. */
let manageGrant: Row | null;
let managePage: Row | null;

/** Every write the routes attempted, as { table, values }. */
let inserts: { table: string; values: Row }[];

function tableName(table: unknown): string {
  // Drizzle keeps the SQL name on a well-known symbol; fall back to a scan of
  // the object's own symbols so a version bump degrades to "unknown" rather
  // than throwing inside the fake.
  for (const sym of Object.getOwnPropertySymbols(table as object)) {
    if (String(sym).includes("Name")) {
      const v = (table as Record<symbol, unknown>)[sym];
      if (typeof v === "string") return v;
    }
  }
  return "unknown";
}

/** A thenable that resolves to `rows` however far the builder chain is taken. */
function chain(rows: () => unknown[], onValues?: (v: Row) => void): any {
  const self: any = {
    from: () => self,
    innerJoin: () => self,
    leftJoin: () => self,
    where: () => self,
    limit: () => self,
    orderBy: () => self,
    set: () => self,
    values: (values: Row) => {
      onValues?.(values);
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
        // uniqueSlug and the crisis "do they already have pages?" check both
        // land here; undefined is a fresh slug and a brand-new organiser.
        supportPagesTable: {
          findFirst: async () => pageRow ?? undefined,
          // GET /organiser/pages asks for the list with its slots.
          findMany: async () => (pageRow ? [{ ...pageRow, slots: [] }] : []),
        },
        pageGrantsTable: {
          findMany: async () => grantRows,
          findFirst: async () => undefined,
        },
        organisersTable: { findFirst: async () => authOrganiser ?? undefined },
        slotsTable: { findMany: async () => [] },
      },
      // Dispatch on the table handed to .from(): requireAuth selects from
      // sessions, requireManagementToken from page_grants. One fake, two
      // middlewares, each getting its real answer.
      select: () =>
        chain(() => {
          // Deliberately resolved lazily so a test can flip the rows between
          // the two calls a single request makes.
          return selectAnswer();
        }),
      insert: (table: unknown) => {
        const name = tableName(table);
        let captured: Row = {};
        return chain(
          () => [
            {
              id: `${name}-new`,
              createdAt: new Date("2026-09-21T00:00:00Z"),
              ...captured,
            },
          ],
          (values) => {
            captured = values;
            inserts.push({ table: name, values });
          },
        );
      },
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  };
});

/**
 * What the next db.select() resolves to. requireAuth runs first on an organiser
 * route and requireManagementToken first on a /manage one, and no single
 * request needs both, so one switch is enough.
 */
let selectMode: "auth" | "manage" = "auth";
function selectAnswer(): unknown[] {
  if (selectMode === "auth") {
    return authOrganiser ? [{ session: {}, organiser: authOrganiser }] : [];
  }
  return manageGrant && managePage
    ? [{ grant: manageGrant, page: managePage }]
    : [];
}

// ─── Every send path, spied ──────────────────────────────────────────────────
//
// Mocked at the LEAF (sms / email) rather than at each caller, so a send that
// goes out through accessGrants, inviteDispatch or item17Notify is caught too —
// all of them end here. Part C's ruling is that adding a task sends NOTHING,
// and this is what makes that a test rather than a comment.
const sendSms = vi.hoisted(() => vi.fn(async () => true));
const sendEmail = vi.hoisted(() => vi.fn(async () => true));
const placeInvite = vi.hoisted(() => vi.fn(async () => undefined));
const notifyHelper = vi.hoisted(() => vi.fn(async () => undefined));
const notifyRecipient = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./sms", () => ({ sendSms, sendSmsWithStatus: sendSms }));
vi.mock("./email", () => ({
  sendItem17Email: sendEmail,
  sendHelperInviteEmail: sendEmail,
  sendPageFeedbackNotification: sendEmail,
  sendCrisisPageSaved: sendEmail,
  sendMagicLink: sendEmail,
}));
vi.mock("./inviteDispatch", () => ({ placeInvite }));
vi.mock("./item17Notify", () => ({
  notifyHelperOfTaskEvent: notifyHelper,
  notifyRecipientOfTaskEvent: notifyRecipient,
  shareLinkFor: () => "https://example.test/s/page-1",
  releaseLinkFor: () => "https://example.test/release/tok",
}));

const { default: organiserRouter } = await import("../routes/organiser");
const { default: manageRouter } = await import("../routes/manage");
const { default: crisisRouter } = await import("../routes/crisis");
const { applyBodyParsers, createErrorHandler } = await import("./requestHygiene");

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  applyBodyParsers(app);
  app.use(organiserRouter);
  app.use(manageRouter);
  app.use(crisisRouter);
  app.use(createErrorHandler({ error: () => undefined }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ORGANISER: Row = {
  id: "org-1",
  email: "fergus@example.test",
  name: "Fergus Ward",
};

const ADMIN: Row = {
  id: "org-admin",
  email: "admin@auntlucy.com.au",
  name: "Kate",
};

const PAGE: Row = {
  id: "page-1",
  slug: "xK9mR2pQ4w",
  organiserId: "org-1",
  recipientName: "Tammy Hughes",
  occasion: "new_baby",
  status: "active",
  closedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

/** A grant belonging to somebody who is NOT the signed-in organiser. */
const RECIPIENT_GRANT: Row = {
  id: "grant-recipient",
  pageId: "page-1",
  token: "recipient-token-never-share-this",
  role: "recipient",
  personName: null,
  personContact: "tammy@example.test",
  revokedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
  selectMode = "auth";
  authOrganiser = { ...ORGANISER };
  pageRow = { ...PAGE };
  grantRows = [];
  manageGrant = null;
  managePage = null;
  inserts = [];
  sendSms.mockClear();
  sendEmail.mockClear();
  placeInvite.mockClear();
  notifyHelper.mockClear();
  notifyRecipient.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function getManageLink(pageId = "page-1"): Promise<Response> {
  return fetch(`${base}/organiser/pages/${pageId}/manage-link`, {
    headers: { authorization: "Bearer session-token" },
  });
}

/** Every send spy, so "nothing went out" is one assertion over all of them. */
function totalSends(): number {
  return (
    sendSms.mock.calls.length +
    sendEmail.mock.calls.length +
    placeInvite.mock.calls.length +
    notifyHelper.mock.calls.length +
    notifyRecipient.mock.calls.length
  );
}

// ─── PART A ──────────────────────────────────────────────────────────────────

describe("Part A — the dashboard's door into /manage", () => {
  it("the owner gets a management url", async () => {
    grantRows = [
      {
        ...RECIPIENT_GRANT,
        id: "grant-mine",
        role: "manager",
        token: "my-own-token",
        personContact: "fergus@example.test",
      },
    ];

    const res = await getManageLink();
    const body = (await res.json()) as { url: string };

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://example.test/manage/my-own-token");
  });

  it("matches the organiser's own contact case-insensitively and trimmed", async () => {
    // The email on the grant was stored with different case and stray spaces —
    // a real hazard, because a second grant minted for the same human would
    // give them two links and two identities on one page.
    grantRows = [
      {
        ...RECIPIENT_GRANT,
        id: "grant-mine",
        role: "manager",
        token: "my-own-token",
        personContact: "  Fergus@Example.TEST ",
      },
    ];

    const body = (await (await getManageLink()).json()) as { url: string };

    expect(body.url).toContain("my-own-token");
    expect(inserts.filter((i) => i.table === "page_grants")).toHaveLength(0);
  });

  it("a second call returns the SAME token and mints nothing new", async () => {
    // First call: no grant of their own, so one is minted.
    grantRows = [];
    const first = (await (await getManageLink()).json()) as { url: string };
    const mintedToken = first.url.split("/manage/")[1];

    expect(inserts.filter((i) => i.table === "page_grants")).toHaveLength(1);
    expect(mintedToken).toBeTruthy();

    // The row it just wrote is now on the page, as it would be in a database.
    const minted = inserts[inserts.length - 1].values;
    grantRows = [{ ...minted, id: "grant-minted", revokedAt: null }];
    inserts = [];

    const second = (await (await getManageLink()).json()) as { url: string };

    expect(second.url).toBe(first.url);
    expect(inserts.filter((i) => i.table === "page_grants")).toHaveLength(0);
  });

  it("someone else's page is 404 — the same answer as no such page", async () => {
    // The ownership filter is in the query, so the fake models the row simply
    // not coming back, which is what a page belonging to another organiser does.
    pageRow = null;

    const res = await getManageLink("page-someone-elses");
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe("Page not found.");
    // And nothing was minted on the way to refusing.
    expect(inserts).toHaveLength(0);
  });

  it("a page with only a RECIPIENT grant mints a new manager grant, and the recipient's token appears nowhere", async () => {
    grantRows = [{ ...RECIPIENT_GRANT }];

    const res = await getManageLink();
    const raw = await res.text();
    const body = JSON.parse(raw) as { url: string };

    // Positive control first: a real url came back, so the absence below is
    // about what is IN a response rather than about an empty one.
    expect(res.status).toBe(200);
    expect(body.url).toContain("https://example.test/manage/");

    // The claim that matters. A grant token is a credential: handing the
    // organiser the recipient's would give them the recipient's identity in
    // every message the page sends.
    expect(raw).not.toContain("recipient-token-never-share-this");

    const granted = inserts.filter((i) => i.table === "page_grants");
    expect(granted).toHaveLength(1);
    expect(granted[0].values.role).toBe("manager");
    expect(granted[0].values.personContact).toBe("fergus@example.test");
  });

  it("a crisis for-self page returns the EXISTING recipient-role setup grant", async () => {
    // On a page someone set up for themselves, their own grant is role
    // "recipient" (lib/setupPersonGrant). Minting a manager grant beside it
    // would start the page telling them about themselves in the third person.
    grantRows = [
      {
        ...RECIPIENT_GRANT,
        id: "grant-self",
        role: "recipient",
        token: "self-setup-token",
        personContact: "fergus@example.test",
      },
    ];

    const body = (await (await getManageLink()).json()) as { url: string };

    expect(body.url).toBe("https://example.test/manage/self-setup-token");
    expect(inserts.filter((i) => i.table === "page_grants")).toHaveLength(0);
  });

  it("minting a link sends nobody a message", async () => {
    grantRows = [];
    const body = (await (await getManageLink()).json()) as { url: string };

    expect(body.url).toContain("/manage/");
    expect(totalSends()).toBe(0);
  });

  it("the page LIST carries no token at all", async () => {
    pageRow = { ...PAGE };
    grantRows = [{ ...RECIPIENT_GRANT }];

    const res = await fetch(`${base}/organiser/pages`, {
      headers: { authorization: "Bearer session-token" },
    });
    const raw = await res.text();

    // Positive control: this really is the list, with a real page on it.
    expect(res.status).toBe(200);
    expect(raw).toContain("xK9mR2pQ4w");
    // The token is fetched on CLICK. One list response must never be able to
    // spill a credential for every page at once.
    expect(raw).not.toContain("recipient-token-never-share-this");
    expect(raw).not.toContain('"token"');
  });
});

// ─── PART B ──────────────────────────────────────────────────────────────────

describe("Part B — creating a page is admin only", () => {
  const body = JSON.stringify({ recipientName: "Tammy Hughes" });
  const headers = {
    authorization: "Bearer session-token",
    "content-type": "application/json",
  };

  it("a non-admin organiser is refused, and no page is written", async () => {
    authOrganiser = { ...ORGANISER };

    const res = await fetch(`${base}/organiser/pages`, {
      method: "POST",
      headers,
      body,
    });

    expect(res.status).toBe(403);
    expect(inserts.filter((i) => i.table === "support_pages")).toHaveLength(0);
  });

  it("the admin still creates pages", async () => {
    authOrganiser = { ...ADMIN };
    pageRow = null; // uniqueSlug finds no collision

    const res = await fetch(`${base}/organiser/pages`, {
      method: "POST",
      headers,
      body,
    });

    expect(res.status).toBe(201);
    expect(inserts.filter((i) => i.table === "support_pages")).toHaveLength(1);
  });

  it("the CRISIS path still creates a page with no admin and no account", async () => {
    // The free crisis path is the other legitimate door and must be untouched:
    // it has no session, no admin, and the person using it is in crisis.
    authOrganiser = null;
    pageRow = null;

    const res = await fetch(`${base}/crisis/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Tammy Hughes",
        email: "fergus@example.test",
        organiserName: "Fergus",
        occasion: "bereavement",
      }),
    });

    const pages = inserts.filter((i) => i.table === "support_pages");
    expect(res.status).toBe(201);
    expect(pages).toHaveLength(1);
    expect(pages[0].values.origin).toBe("crisis_free");
    expect(pages[0].values.status).toBe("draft");
  });
});

// ─── PART C ──────────────────────────────────────────────────────────────────

describe("Part C — adding a task to a live page", () => {
  const headers = { "content-type": "application/json" };

  function asManager(status = "active") {
    selectMode = "manage";
    manageGrant = { id: "grant-mine", role: "manager" };
    managePage = { ...PAGE, status };
  }

  async function addTask(body: Row): Promise<Response> {
    return fetch(`${base}/manage/tok/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("creates a task on an active page", async () => {
    asManager();

    const res = await addTask({
      slotType: "meal",
      slotDate: "2026-10-02",
      slotTime: "18:00",
      notes: "No nuts please.",
      headcount: "4",
    });
    const created = (await res.json()) as Row;

    expect(res.status).toBe(201);
    expect(created.slotType).toBe("meal");
    expect(created.headcount).toBe(4);
    expect(created.trustedHelpersOnly).toBe(false);
    // The display name, not the raw enum key (#127) — and in its HEADING form
    // (row #136), because this is what heads the task on the family's list.
    expect(created.label).toBe("Meal");
  });

  it("a recipient grant can add one too — no account anywhere", async () => {
    selectMode = "manage";
    manageGrant = { id: "grant-recipient", role: "recipient" };
    managePage = { ...PAGE };

    const res = await addTask({ slotType: "visit", slotDate: "2026-10-02" });

    expect(res.status).toBe(201);
  });

  it("a CLOSED page refuses with 410 and writes nothing", async () => {
    asManager("closed");

    const res = await addTask({ slotType: "meal", slotDate: "2026-10-02" });

    expect(res.status).toBe(410);
    expect(inserts.filter((i) => i.table === "slots")).toHaveLength(0);
  });

  it("a school run is trusted-only even when the request says otherwise", async () => {
    asManager();

    const res = await addTask({
      slotType: "school_pickup",
      slotDate: "2026-10-02",
      slotTime: "15:00",
      trustedHelpersOnly: false,
    });
    const created = (await res.json()) as Row;

    expect(res.status).toBe(201);
    expect(created.trustedHelpersOnly).toBe(true);
  });

  it("minding the kids is trusted-only too", async () => {
    asManager();

    const created = (await (
      await addTask({
        slotType: "child_care",
        slotDate: "2026-10-02",
        trustedHelpersOnly: false,
      })
    ).json()) as Row;

    expect(created.trustedHelpersOnly).toBe(true);
  });

  it("🛑 SENDS NOTHING — not even for a trusted-only task", async () => {
    asManager();

    const res = await addTask({
      slotType: "school_pickup",
      slotDate: "2026-10-02",
      slotTime: "15:00",
    });

    // Positive control: the task really was created, so "nothing was sent" is
    // a statement about a route that DID something, not about one that failed.
    expect(res.status).toBe(201);
    expect(inserts.filter((i) => i.table === "slots")).toHaveLength(1);

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(placeInvite).not.toHaveBeenCalled();
    expect(notifyHelper).not.toHaveBeenCalled();
    expect(notifyRecipient).not.toHaveBeenCalled();
    expect(totalSends()).toBe(0);
  });

  it("sends nothing for an ordinary task either", async () => {
    asManager();
    const res = await addTask({ slotType: "meal", slotDate: "2026-10-02" });

    expect(res.status).toBe(201);
    expect(totalSends()).toBe(0);
  });

  it("the answer to \"does it need to be at that time?\" is stored", async () => {
    asManager();

    const created = (await (
      await addTask({
        slotType: "meal",
        slotDate: "2026-10-02",
        slotTime: "18:00",
        flexibility: "fixed",
      })
    ).json()) as Row;

    // A meal defaults to flexible, so this proves the answer was read rather
    // than the default happening to agree.
    expect(created.flexibility).toBe("fixed");
  });

  /**
   * ROW #143 — a task with NO TIME is stored FLEXIBLE, whatever arrives.
   *
   * "Fixed" means the time is the family's fact and a helper may not move it.
   * With no time there is no fact, and a fixed timeless task would text the
   * family about a change to a time nobody ever set. The form no longer asks
   * the question until a time is entered; this is the same rule where it is
   * stored, so a hand-made request cannot get round it either.
   */
  it("a task with NO TIME is flexible, even when the request says fixed", async () => {
    asManager();

    const created = (await (
      await addTask({
        slotType: "meal",
        slotDate: "2026-10-02",
        flexibility: "fixed",
      })
    ).json()) as Row;

    expect(created.flexibility).toBe("flexible");
  });

  it("…and a VISIT with no time too, whose own default is fixed", async () => {
    asManager();

    // Positive control on the rule rather than on the request: a visit sends no
    // answer at all, and its category default is fixed. Without the row #143
    // rule this would come back "fixed".
    const created = (await (
      await addTask({ slotType: "visit", slotDate: "2026-10-02" })
    ).json()) as Row;

    expect(created.flexibility).toBe("flexible");
  });
});

// ─── VALIDATION PARITY ───────────────────────────────────────────────────────

describe("both doors give the same answers to the same task", () => {
  /**
   * The point of lib/newTaskInput. These drive the two REAL routes with
   * identical bodies and compare status and message — so a rule changed on one
   * and not the other fails here, which is the drift the shared module exists
   * to prevent.
   */
  const CASES: { name: string; body: Row }[] = [
    { name: "a missing type", body: { slotDate: "2026-10-02" } },
    { name: "a nonsense type", body: { slotType: "hovercraft", slotDate: "2026-10-02" } },
    { name: "a missing date", body: { slotType: "meal" } },
    { name: "a malformed date", body: { slotType: "meal", slotDate: "02-10-2026" } },
    {
      name: "a lift with no wait answer",
      body: { slotType: "errand", slotDate: "2026-10-02", slotTime: "09:00" },
    },
    {
      name: "a lift with no time",
      body: { slotType: "errand", slotDate: "2026-10-02", liftWaitMode: "waits" },
    },
    {
      name: "a school run that asks not to be trusted-only",
      body: {
        slotType: "school_pickup",
        slotDate: "2026-10-02",
        slotTime: "15:00",
        trustedHelpersOnly: false,
      },
    },
    {
      name: "dietary detail on a dog walk",
      body: {
        slotType: "dog_walking",
        slotDate: "2026-10-02",
        dietaryNotes: "no onion",
        headcount: 6,
      },
    },
  ];

  for (const c of CASES) {
    it(`${c.name} is answered identically by both routes`, async () => {
      // The organiser door.
      selectMode = "auth";
      authOrganiser = { ...ORGANISER };
      pageRow = { ...PAGE };
      const viaOrganiser = await fetch(`${base}/organiser/pages/page-1/slots`, {
        method: "POST",
        headers: {
          authorization: "Bearer session-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(c.body),
      });
      const organiserBody = (await viaOrganiser.json()) as Row;

      // The /manage door.
      selectMode = "manage";
      manageGrant = { id: "grant-mine", role: "manager" };
      managePage = { ...PAGE };
      const viaManage = await fetch(`${base}/manage/tok/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c.body),
      });
      const manageBody = (await viaManage.json()) as Row;

      expect(viaManage.status).toBe(viaOrganiser.status);
      if (viaOrganiser.status === 400) {
        expect(manageBody.error).toBe(organiserBody.error);
      } else {
        // A body that is ACCEPTED must be stored the same way by both — the
        // sensitivity flag above all.
        expect(manageBody.trustedHelpersOnly).toBe(organiserBody.trustedHelpersOnly);
        expect(manageBody.slotType).toBe(organiserBody.slotType);
        expect(manageBody.dietaryNotes).toBe(organiserBody.dietaryNotes);
        expect(manageBody.headcount).toBe(organiserBody.headcount);
        expect(manageBody.liftWaitMode).toBe(organiserBody.liftWaitMode);
      }
    });
  }
});

/**
 * ── SABOTAGE LOG ─────────────────────────────────────────────────────────────
 * Each of these was applied to the real source, the suite run, and the change
 * reverted. A test that did not go red would be decoration.
 *
 * 1. manage-link returns the FIRST grant on the page rather than the
 *    organiser's own (`grants[0]` instead of the contact match)
 *      → "the recipient's token appears nowhere" FAILS (the token is in the
 *        body), and "a crisis for-self page returns the existing grant" still
 *        passes — which is exactly why the first test exists.
 * 2. the admin check on POST /organiser/pages deleted
 *      → "a non-admin organiser is refused" FAILS with 201.
 * 3. POST /manage/:token/tasks calls placeInvite for a trusted-only task
 *      → "🛑 SENDS NOTHING" FAILS on placeInvite, and totalSends() is 1.
 * 4. the /manage add-task route validates inline (school_pickup no longer
 *    forced trusted) instead of calling validateNewTask
 *      → "a school run is trusted-only even when the request says otherwise"
 *        FAILS, and the parity case for it FAILS too.
 * 5. manage-link mints a second grant every call (the `if (mine)` early return
 *    removed)
 *      → "a second call returns the SAME token" FAILS on both the url and the
 *        insert count.
 */
