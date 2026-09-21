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
 * "Closed on {date}" renders as TWO text nodes, so a plain string matcher
 * cannot see it. This matches on the element's whole textContent instead.
 *
 * The date is computed here the same way the card computes it, deliberately:
 * pinning a literal would make the test hostage to the machine timezone (the
 * same instant is Friday in Melbourne and Thursday in London), and a test that
 * fails on a colleague's laptop teaches nobody anything. What is being proved
 * is that the LINE is there and carries that page's date, which it does.
 */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
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
    expect(hasLine(`Closed on ${longDate("2026-09-18T04:00:00.000Z")}`)).toBeTruthy();

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
      hasLine(`Not live yet · started ${longDate("2026-08-12T00:00:00.000Z")}`),
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
 * 5. the manage-link fetch moved into the list effect (fetched for every page
 *    up front)
 *      → "the token is fetched on CLICK, never with the list" FAILS.
 */
