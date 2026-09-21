/**
 * Bug #090 — what a CLOSED page actually renders.
 *
 * ⚠️ P2, and this file is mostly absence tests, which are the dangerous kind.
 * "The closed page never says why" passes for free if nothing rendered at all —
 * a blank screen contains no reasons either. So every absence here is asserted
 * beside a marker ONLY THE REAL CLOSED PAGE PRODUCES (`support-page-closed`,
 * `manage-closed`), from the same render.
 *
 * These drive the real components against a stubbed transport, so what is
 * checked is the screen a person sees, not a copy module read as text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import SupportPage from "@/pages/SupportPage";
import { Manage } from "@/pages/Manage";
import { closure as closeCopy } from "@/lib/pageClosureCopy";

// The generated client calls global fetch, so the transport is stubbed here
// rather than a module being mocked.
const server = vi.hoisted(() => ({
  calls: [] as { url: string; method: string; body: unknown }[],
  /** What GET /api/pages/:slug answers. */
  pageStatus: "closed" as "closed" | "missing",
  /** What GET /api/manage/:token answers. */
  manageStatus: "closed" as "closed" | "active",
  closurePeople: [] as unknown[],
}));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CLOSED_MANAGE = {
  role: "recipient",
  recipientName: "Tammy Hughes",
  status: "closed",
  closedAt: "2026-09-18T04:00:00.000Z",
  slug: "xK9mR2pQ4w",
  occasion: "bereavement",
  recipientPronouns: "she_her",
  managers: [],
  recipientHasOwnAccess: false,
  feedbackVisible: false,
  feedbackGiven: false,
  cardKeepsakeUrl: null,
  situationLine: null,
  situationLineDefault: "",
  trustedLine: null,
  trustedLineDefault: "",
  babyStage: null,
  recipientEmail: null,
  recipientMobile: null,
  bereavement: true,
  shareLink: "https://example.test/s/xK9mR2pQ4w",
  tasks: [],
  contacts: [],
  invites: [],
};

const ACTIVE_MANAGE = {
  ...CLOSED_MANAGE,
  status: "active",
  closedAt: null,
  tasks: [
    {
      id: "slot-1",
      slotType: "school_pickup",
      label: "School pickup",
      customLabel: null,
      notes: null,
      flexibility: "fixed",
      trustedHelpersOnly: false,
      isClaimed: true,
      claimedByName: "Priya",
      claimedNote: null,
      claimedAt: "2026-09-10T04:00:00.000Z",
      slotDate: "2026-09-22",
      slotTime: "15:15",
      liftWaitMode: null,
      dietaryNotes: null,
      headcount: null,
    },
  ],
};

beforeEach(() => {
  server.calls = [];
  server.pageStatus = "closed";
  server.manageStatus = "closed";
  server.closurePeople = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    server.calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });

    if (url.includes("/api/pages/")) {
      return server.pageStatus === "closed"
        ? json(404, { error: "This support page has been closed." })
        : json(404, { error: "This support page doesn't exist or has been removed." });
    }
    if (url.includes("/closure-preview")) {
      return json(200, { recipientName: "Tammy Hughes", people: server.closurePeople });
    }
    if (url.includes("/close") || url.includes("/reopen")) {
      return json(200, { ok: true, cancelled: 1, helpersTold: 1, othersTold: 0 });
    }
    if (url.includes("/api/manage/")) {
      return json(200, server.manageStatus === "closed" ? CLOSED_MANAGE : ACTIVE_MANAGE);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string, pattern: string, Component: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Router hook={(() => [path, () => {}]) as never}>
        <Route path={pattern} component={Component} />
      </Router>
    </QueryClientProvider>,
  );
}

// ─── The public page (ruling 6) ──────────────────────────────────────────────

describe("the public page of a closed support page", () => {
  it("says it has closed, and is NOT the generic not-found screen", async () => {
    renderAt("/s/xK9mR2pQ4w", "/s/:slug", SupportPage);

    // The positive control, and every absence below hangs off it: this marker
    // exists ONLY on the closed branch.
    const closed = await screen.findByTestId("support-page-closed");
    expect(closed).toBeTruthy();
    // The fault this replaced (#028, third occurrence).
    expect(screen.queryByText(/doesn't exist or has been removed/i)).toBeNull();
    expect(screen.queryByText(/Page not found/i)).toBeNull();
  });

  it("🛑 NEVER SAYS WHY — no occasion, no circumstances, no reason", async () => {
    // The page's occasion here is bereavement and its recipient is named
    // Tammy. Neither may appear: this screen is reachable by anyone holding
    // the link, including people the family never invited.
    const closed = await (async () => {
      renderAt("/s/xK9mR2pQ4w", "/s/:slug", SupportPage);
      return screen.findByTestId("support-page-closed");
    })();

    const text = document.body.textContent ?? "";
    // Positive control FIRST: something real rendered, so the absences below
    // are absences from a page and not from a blank screen.
    expect(closed).toBeTruthy();
    expect(text).toMatch(/closed/i);

    for (const forbidden of [
      /died/i,
      /death/i,
      /passed away/i,
      /bereave/i,
      /funeral/i,
      /no longer needs/i,
      /Tammy/,
      /illness|surgery|baby/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it("a genuinely unknown slug still gets the generic screen", async () => {
    // The other half of the table: matching on the server's message must not
    // turn every 404 into "this page has closed".
    server.pageStatus = "missing";
    renderAt("/s/nope", "/s/:slug", SupportPage);
    expect(await screen.findByText(/doesn't exist or has been removed/i)).toBeTruthy();
    expect(screen.queryByTestId("support-page-closed")).toBeNull();
  });
});

// ─── /manage on a closed page (Kate's ruling, 20 Sep) ────────────────────────

describe("/manage on a closed page", () => {
  it("offers exactly two things: that it is closed, and reopening", async () => {
    renderAt("/manage/tok", "/manage/:token", Manage);

    const closed = await screen.findByTestId("manage-closed");
    expect(closed).toBeTruthy();
    expect(screen.getByText(closeCopy.closedTitle)).toBeTruthy();
    // "and when".
    expect(document.body.textContent).toMatch(/Closed on/);
    expect(screen.getByRole("button", { name: closeCopy.reopenButton })).toBeTruthy();

    // Everything else is gone — beside the positive control above, so this is
    // an absence from a rendered screen rather than from nothing.
    expect(screen.queryByText("Your people")).toBeNull();
    expect(screen.queryByTestId("open-close-dialog")).toBeNull();
    expect(document.body.textContent).not.toMatch(/School pickup/);
  });

  it("says BOTH halves of what reopening does", async () => {
    renderAt("/manage/tok", "/manage/:token", Manage);
    await screen.findByTestId("manage-closed");
    const text = document.body.textContent ?? "";
    // The page comes back…
    expect(text).toMatch(/reopen/i);
    // …the bookings do not. "You can undo this" alone is not true.
    // Kate's wording, 21 Sep 2026 (#132), asserted as the exact string so a
    // reword has to be a deliberate one.
    expect(text).toContain(closeCopy.reopenWarning);
    expect(text).toContain("brings the tasks back, but not the bookings");
  });

  it("no longer claims reopening restores the page 'exactly as it was'", async () => {
    // THE OLD LINE WAS BOTH SELF-CONTRADICTORY AND UNTRUE (#132). It said
    // reopening brought the page back "exactly as it was, minus the tasks
    // people had booked" — but the TASKS come back and the BOOKINGS do not,
    // so it named the wrong thing as the loss while promising no loss at all.
    renderAt("/manage/tok", "/manage/:token", Manage);
    await screen.findByTestId("manage-closed");
    const text = document.body.textContent ?? "";
    // Positive control: the closed screen really rendered its own words.
    expect(text).toContain(closeCopy.closedTitle);
    expect(text).toContain(closeCopy.closedBody);
    expect(text).not.toMatch(/exactly as it was/i);
    expect(text).not.toMatch(/minus the tasks/i);
    expect(text).not.toMatch(/come back unclaimed/i);
  });

  it("promises no retention window, because nothing enforces one yet", async () => {
    // Kate has RULED the number (30 days, one clock for reopening and for
    // destruction) and written the line, but there is no destruction job and
    // nothing blocks a reopen on day 31. Saying it here before it is true
    // would be a claim about the world, not a fact about the page. The
    // approved wording is parked in pageClosureCopy.ts, above closedBody.
    renderAt("/manage/tok", "/manage/:token", Manage);
    await screen.findByTestId("manage-closed");
    const text = document.body.textContent ?? "";
    expect(text).toContain(closeCopy.closedBody);
    expect(text).not.toMatch(/30 days|thirty days/i);
    expect(text).not.toMatch(/delete|deleted|for good|permanently/i);
  });

  it("reopening posts to reopen and NOTHING re-claims anything", async () => {
    renderAt("/manage/tok", "/manage/:token", Manage);
    await screen.findByTestId("manage-closed");
    fireEvent.click(screen.getByRole("button", { name: closeCopy.reopenButton }));

    await vi.waitFor(() => {
      expect(server.calls.some((c) => c.url.includes("/reopen") && c.method === "POST")).toBe(true);
    });
    // The whole of ruling 5 on the wire: one call, carrying nothing that could
    // restore a claim.
    const reopen = server.calls.find((c) => c.url.includes("/reopen"));
    expect(reopen?.body).toBeUndefined();
    expect(server.calls.some((c) => c.url.includes("/claim"))).toBe(false);
  });
});

// ─── The confirm screen (rulings 3, 4, 5) ────────────────────────────────────

describe("the close confirm screen", () => {
  beforeEach(() => {
    server.manageStatus = "active";
    server.closurePeople = [
      {
        slotId: "slot-1",
        name: "Priya",
        task: "the school pickup",
        when: "Tuesday 22 September at 3:15pm",
        reachable: true,
      },
    ];
  });

  async function openDialog() {
    renderAt("/manage/tok", "/manage/:token", Manage);
    fireEvent.click(await screen.findByTestId("open-close-dialog"));
    return screen.findByTestId("close-confirm");
  }

  it("names each person and the task they committed to", async () => {
    await openDialog();
    const list = await screen.findByTestId("close-people");
    expect(list.textContent).toContain("Priya");
    expect(list.textContent).toContain("the school pickup");
    expect(list.textContent).toContain("Tuesday 22 September at 3:15pm");
  });

  it("THE OPTIONAL BOX IS EMPTY, and nothing is prefilled into it", async () => {
    await openDialog();
    const box = (await screen.findByTestId("close-note")) as HTMLTextAreaElement;
    // Ruling 4(b): prefilled text gets sent unread.
    expect(box.value).toBe("");
    // The placeholder says what the field is FOR and does not suggest what to
    // write — a placeholder like "Mum passed away on Friday" would be a
    // template for the hardest sentence someone ever types.
    expect(box.placeholder).toBe(closeCopy.notePlaceholder);
    expect(box.placeholder).not.toMatch(/died|passed away|sadly|thank you all/i);
  });

  it("offers both tellings, defaults to telling them, and sends the choice", async () => {
    await openDialog();
    const ours = screen.getByRole("radio", { name: new RegExp(closeCopy.tellOptionUs) });
    const theirs = screen.getByRole("radio", { name: new RegExp(closeCopy.tellOptionMe) });
    // Default: choosing silence is the deliberate act.
    expect((ours as HTMLInputElement).checked).toBe(true);

    fireEvent.click(theirs);
    fireEvent.click(screen.getByTestId("confirm-close"));

    await vi.waitFor(() => {
      expect(server.calls.some((c) => c.url.includes("/close") && c.method === "POST")).toBe(true);
    });
    const close = server.calls.find((c) => c.url.includes("/close") && c.method === "POST");
    expect(close?.body).toMatchObject({ tellHelpers: false, note: null });
  });

  it("says BOTH halves of the reversibility before the button", async () => {
    const dialog = await openDialog();
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/reopen/i);
    expect(text).toMatch(/doesn't bring back|can't be unsent/i);
  });

  it("neither button is red", async () => {
    // Kate's rule: red is a currency. Closing is considered and reversible.
    await openDialog();
    for (const id of ["confirm-close", "open-close-dialog"]) {
      const button = screen.queryByTestId(id);
      if (!button) continue;
      expect(button.className).not.toMatch(/destructive|bg-red|text-red/);
    }
  });
});
