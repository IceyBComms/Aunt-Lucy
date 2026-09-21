/**
 * What the dashboard card actually offers, and who is shown the way back.
 * (Kate's ruling, 21 September 2026 — Parts A, B and D.)
 *
 * These drive the REAL components against a stubbed transport, so what is
 * checked is the screen a person sees rather than a copy module read as text.
 *
 * ⚠️ P2, and this file is largely about ABSENCES — a closed card used to have
 * no controls, a non-admin must not be offered "New page", a texted recipient
 * must not be offered a dashboard. Every one of those passes for free against a
 * screen that rendered nothing, so each sits beside a positive control FROM THE
 * SAME RENDER: the card's own heading, the page's own title. The sabotage log
 * at the bottom records what was broken to prove each one bites.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";

// ─── The signed-in person, swapped per test ──────────────────────────────────
const auth = vi.hoisted(() => ({
  organiser: null as { id: string; email: string; isAdmin: boolean } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    organiser: auth.organiser,
    isLoading: false,
    signIn: () => {},
    signOut: async () => {},
  }),
  useOptionalAuth: () => ({
    token: "test-token",
    organiser: auth.organiser,
    isLoading: false,
    signIn: () => {},
    signOut: async () => {},
  }),
}));

// ─── The dashboard's transport (raw apiFetch, not the generated client) ──────
const api = vi.hoisted(() => ({
  pages: [] as unknown[],
  /** Every path apiFetch was asked for, so "fetched on click" is provable. */
  calls: [] as string[],
}));

vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string) => {
    api.calls.push(path);
    if (path === "/organiser/pages") return api.pages;
    if (path.endsWith("/manage-link")) {
      return { url: "https://example.test/manage/my-own-token" };
    }
    throw new Error(`unexpected ${path}`);
  },
  ApiError: class ApiError extends Error {},
}));

const { default: OrganiseDashboard } = await import("@/pages/OrganiseDashboard");

/**
 * The form BOTH card dates are written in — draft and closed alike.
 *
 * Computed here the same way the card computes it, deliberately: pinning a
 * literal would make these tests hostage to the machine timezone (the same
 * instant is one day in Melbourne and another in London), and a test that
 * fails on a colleague's laptop teaches nobody anything. What this proves is
 * that the LINE is there and carries that page's date. The FORM itself —
 * no weekday, and the year only when it differs — is pinned separately below,
 * where mirroring the implementation would not bite.
 */
function cardDate(iso: string): string {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

function hasLine(expected: string): HTMLElement {
  return screen.getByText((_content, el) => el?.textContent === expected);
}

function page(over: Record<string, unknown> = {}) {
  return {
    id: "page-1",
    slug: "xK9mR2pQ4w",
    recipientName: "Tammy Hughes",
    location: "Fitzroy",
    status: "active",
    privacy: "open",
    createdAt: "2026-08-12T00:00:00.000Z",
    closedAt: null,
    slotCount: 3,
    claimedCount: 1,
    ...over,
  };
}

function renderDashboard() {
  render(
    <Router hook={(() => ["/organise/dashboard", () => {}]) as never}>
      <Route path="/organise/dashboard" component={OrganiseDashboard} />
    </Router>,
  );
}

beforeEach(() => {
  auth.organiser = { id: "org-1", email: "fergus@example.test", isAdmin: false };
  api.pages = [];
  api.calls = [];
});

afterEach(() => cleanup());

// ─── PART A: what each card offers ───────────────────────────────────────────

describe("Part A — the buttons on a dashboard card", () => {
  it("an ACTIVE card leads with Make changes, and renames View", async () => {
    api.pages = [page()];
    renderDashboard();

    // Positive control: this really is the card for this page.
    expect(await screen.findByText("Support for Tammy Hughes")).toBeTruthy();

    expect(screen.getByRole("button", { name: /Make changes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View as a helper/ })).toBeTruthy();
    // "View" alone never said WHICH page you were about to get.
    expect(screen.queryByRole("link", { name: "View" })).toBeNull();
  });

  it("a CLOSED card says when, and can still be opened — it had NO controls at all", async () => {
    api.pages = [
      page({ status: "closed", closedAt: "2026-09-18T04:00:00.000Z" }),
    ];
    renderDashboard();

    // Positive control from the same render: the card exists and says closed.
    expect(await screen.findByText("Support for Tammy Hughes")).toBeTruthy();
    expect(hasLine(`Closed on ${cardDate("2026-09-18T04:00:00.000Z")}`)).toBeTruthy();

    // The claim. Before this a closed page could not be reopened from here,
    // even though /manage has offered reopening since #090.
    expect(screen.getByRole("button", { name: /Make changes/ })).toBeTruthy();
    // And a closed page is not one to share.
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("a DRAFT card keeps its own two buttons and says it is not live", async () => {
    api.pages = [page({ status: "draft" })];
    renderDashboard();

    expect(await screen.findByText("Support for Tammy Hughes")).toBeTruthy();
    // Row #130 — two drafts for the same person were identical cards.
    expect(
      hasLine(`Not live yet · started ${cardDate("2026-08-12T00:00:00.000Z")}`),
    ).toBeTruthy();

    expect(screen.getByRole("button", { name: /Continue setting up/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete draft for Tammy Hughes/ })).toBeTruthy();
    // A draft is not live, so there is nothing to make changes to yet and
    // nothing to share.
    expect(screen.queryByRole("button", { name: /Make changes/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("the token is fetched on CLICK, never with the list", async () => {
    api.pages = [page()];
    renderDashboard();
    await screen.findByText("Support for Tammy Hughes");

    // The list has been fetched and the card is on screen — and no management
    // link has been asked for. One list response must never be able to spill a
    // credential for every page at once.
    expect(api.calls).toContain("/organiser/pages");
    expect(api.calls.some((c) => c.endsWith("/manage-link"))).toBe(false);
  });
});

// ─── PART A: how the draft date is written ───────────────────────────────────

describe("how the card dates are written (Kate's ruling, 21 Sep 2026)", () => {
  const WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  /** An ISO date in a given year, built from today so this never goes stale. */
  function iso(yearsAgo: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    // Midday, so no timezone can shift it into a neighbouring day and change
    // which weekday name we would be looking for.
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  /** The whole "Not live yet · started …" line, as rendered. */
  async function draftLine(createdAt: string): Promise<string> {
    api.pages = [page({ status: "draft", createdAt })];
    renderDashboard();
    await screen.findByText("Support for Tammy Hughes");
    const el = screen.getByText((_c, e) =>
      (e?.textContent ?? "").startsWith("Not live yet · started"),
    );
    return el.textContent ?? "";
  }

  it("carries no weekday — which Wednesday it was is not what tells drafts apart", async () => {
    const line = await draftLine(iso(0));

    // Positive control: the line really rendered, with a real date on it.
    expect(line).toContain("Not live yet · started");
    expect(line.length).toBeGreaterThan("Not live yet · started ".length);

    for (const day of WEEKDAYS) {
      expect(line).not.toContain(day);
    }
  });

  it("carries no year when the draft is from this year", async () => {
    const thisYear = String(new Date().getFullYear());
    const line = await draftLine(iso(0));

    expect(line).toContain("Not live yet · started");
    expect(line).not.toContain(thisYear);
  });

  it("DOES carry the year when the draft is from another year", async () => {
    // A draft left over from last year is a different kind of thing from one
    // started on Tuesday, and the year is the whole point.
    const lastYear = String(new Date().getFullYear() - 1);
    const line = await draftLine(iso(1));

    expect(line).toContain(lastYear);
    // Still no weekday, even here.
    for (const day of WEEKDAYS) {
      expect(line).not.toContain(day);
    }
  });
  /** The whole "Closed on …" line, as rendered. */
  async function closedLine(closedAt: string): Promise<string> {
    api.pages = [page({ status: "closed", closedAt })];
    renderDashboard();
    await screen.findByText("Support for Tammy Hughes");
    const el = screen.getByText((_c, e) =>
      (e?.textContent ?? "").startsWith("Closed on"),
    );
    return el.textContent ?? "";
  }

  it("the CLOSED line is written the same way — no weekday, no year this year", async () => {
    const line = await closedLine(iso(0));

    // Positive control: the line really rendered, with a real date on it.
    expect(line).toContain("Closed on");
    expect(line.length).toBeGreaterThan("Closed on ".length);

    for (const day of WEEKDAYS) {
      expect(line).not.toContain(day);
    }
    expect(line).not.toContain(String(new Date().getFullYear()));
  });

  it("the CLOSED line carries the year when it is from another year", async () => {
    const line = await closedLine(iso(1));

    expect(line).toContain(String(new Date().getFullYear() - 1));
  });

  it("the two card dates agree — a draft and a closed page from the same day read alike", async () => {
    // The claim that matters, and the reason both lines share one helper: they
    // sit on adjacent cards in the same list, so two formats would be visible
    // side by side. Row #139 is open because dates are written several
    // different ways across the product; this is the one place they now don't.
    const when = iso(0);
    const draft = await draftLine(when);
    cleanup();
    const closed = await closedLine(when);

    const draftDate = draft.replace("Not live yet · started ", "");
    const closedDate = closed.replace("Closed on ", "");

    // Positive control: both really produced a date, so this is not two empty
    // strings agreeing with each other.
    expect(draftDate.length).toBeGreaterThan(0);
    expect(draftDate).toBe(closedDate);
  });
});

// ─── PART A: the counts ──────────────────────────────────────────────────────

describe("Part A — the counts read as words, not rows", () => {
  const CASES: [number, number, string, string][] = [
    [3, 1, "3 tasks", "1 has someone"],
    [1, 1, "1 task", "1 has someone"],
    [4, 2, "4 tasks", "2 have someone"],
    // Zero is the case a number reads worst: "0 have someone" lands as a
    // failure, when it is a page that has only just started.
    [2, 0, "2 tasks", "nobody yet"],
  ];

  for (const [slots, claimed, tasksLabel, coveredText] of CASES) {
    it(`${slots}/${claimed} reads "${tasksLabel} · ${coveredText}"`, async () => {
      api.pages = [page({ slotCount: slots, claimedCount: claimed })];
      renderDashboard();

      expect(await screen.findByText(tasksLabel)).toBeTruthy();
      expect(screen.getByText(coveredText)).toBeTruthy();
    });
  }

  it("the old database words are gone", async () => {
    api.pages = [page({ slotCount: 3, claimedCount: 1 })];
    renderDashboard();

    expect(await screen.findByText("3 tasks")).toBeTruthy();
    expect(screen.queryByText("3 slots")).toBeNull();
    expect(screen.queryByText("1 claimed")).toBeNull();
  });
});

// ─── PART B: who may create a page ───────────────────────────────────────────

describe("Part B — New page is admin only", () => {
  it("a non-admin is offered neither button", async () => {
    auth.organiser = { id: "org-1", email: "fergus@example.test", isAdmin: false };
    api.pages = [page()];
    renderDashboard();

    // Positive control: the dashboard really rendered, with its heading and a
    // real card, so "no New page button" is about this screen and not a blank.
    expect(await screen.findByText("Support pages")).toBeTruthy();
    expect(screen.getByText("Support for Tammy Hughes")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /New page/ })).toBeNull();
  });

  it("a non-admin with nothing is pointed at the front door", async () => {
    auth.organiser = { id: "org-1", email: "fergus@example.test", isAdmin: false };
    api.pages = [];
    renderDashboard();

    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Start from the Aunt Lucy home page" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create your first page/ })).toBeNull();
  });

  it("the admin still gets both", async () => {
    auth.organiser = { id: "org-admin", email: "admin@auntlucy.com.au", isAdmin: true };
    api.pages = [];
    renderDashboard();

    expect(await screen.findByRole("button", { name: /New page/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create your first page/ })).toBeTruthy();
    expect(screen.queryByText("Nothing here yet.")).toBeNull();
  });
});

// ─── PART D: the heading in white ────────────────────────────────────────────

describe("Part D — the heading on the coloured header", () => {
  it('"My dashboard" carries its own white, not the inherited one', async () => {
    api.pages = [page()];
    renderDashboard();

    const heading = await screen.findByRole("heading", { name: "My dashboard" });
    // index.css applies text-foreground to every h1–h6 in @layer base. A rule
    // that MATCHES the h1 beats a colour INHERITED from the coloured header, so
    // the heading has to say white itself.
    expect(heading.className).toContain("text-white");
  });
});

/**
 * ── SABOTAGE LOG ─────────────────────────────────────────────────────────────
 * Each applied to the real source, suite run, change reverted.
 *
 * 1. the closed-card block removed from OrganiseDashboard
 *      → "a CLOSED card says when, and can still be opened" FAILS on the
 *        Make changes button, while the positive control still passes.
 * 2. the `organiser?.isAdmin &&` guard removed from the New page button
 *      → "a non-admin is offered neither button" FAILS.
 * 3. the counts reverted to "{n} slots" / "{m} claimed"
 *      → every case in "the counts read as words" FAILS, and so does "the old
 *        database words are gone".
 * 4. `text-white` removed from the dashboard h1
 *      → "My dashboard carries its own white" FAILS.
 * 5. the weekday and year put back on the draft line's date
 *      → "carries no weekday" and "carries no year when the draft is from
 *        this year" both FAIL, along with the exact-line assertion.
 * 6. the closed line given its own long-form helper again, leaving the draft
 *    line on the short one
 *      → the closed-line form test FAILS, the exact-line assertion FAILS, and
 *        so does "the two card dates agree" — which is the one that exists to
 *        stop exactly this, a second date format appearing on the card beside
 *        the first.
 * 7. the manage-link fetch moved into the list effect (fetched for every page
 *    up front)
 *      → "the token is fetched on CLICK, never with the list" FAILS.
 */
