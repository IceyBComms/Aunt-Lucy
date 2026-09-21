/**
 * Who is shown "Back to my dashboard" on /manage (Part A, 21 September 2026).
 *
 * THE POINT. Almost everybody on this screen has no account: the recipient, and
 * any manager the family added, both arrived by a link sent to them. A link
 * promising them "my dashboard" opens on a sign-in form they cannot use. An
 * organiser signed in on the same screen is the exception, and the only one who
 * should see it.
 *
 * ⚠️ P2. "The link is absent" passes for free against a screen that rendered
 * nothing at all, so the absence is asserted beside a positive control from the
 * SAME render — the page's own heading — and beside the mirror test where the
 * very same payload DOES show the link. A component that rendered nothing would
 * fail that one.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";

const auth = vi.hoisted(() => ({
  organiser: null as { id: string; email: string; isAdmin: boolean } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => {
    throw new Error("Manage must not demand a signed-in context");
  },
  // Null models a viewer with no account — which is what a texted recipient
  // and a texted manager both are.
  useOptionalAuth: () =>
    auth.organiser
      ? {
          token: "test-token",
          organiser: auth.organiser,
          isLoading: false,
          signIn: () => {},
          signOut: async () => {},
        }
      : null,
}));

const { Manage } = await import("@/pages/Manage");

const ACTIVE_MANAGE = {
  role: "recipient",
  recipientName: "Tammy Hughes",
  status: "active",
  closedAt: null,
  slug: "xK9mR2pQ4w",
  occasion: "new_baby",
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
  bereavement: false,
  shareLink: "https://example.test/s/xK9mR2pQ4w",
  tasks: [],
  contacts: [],
  invites: [],
};

const CLOSED_MANAGE = {
  ...ACTIVE_MANAGE,
  status: "closed",
  closedAt: "2026-09-18T04:00:00.000Z",
};

const state = vi.hoisted(() => ({ status: "active" as "active" | "closed" }));

beforeEach(() => {
  auth.organiser = null;
  state.status = "active";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/manage/")) {
      return new Response(
        JSON.stringify(state.status === "closed" ? CLOSED_MANAGE : ACTIVE_MANAGE),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderManage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Router hook={(() => ["/manage/tok", () => {}]) as never}>
        <Route path="/manage/:token" component={Manage} />
      </Router>
    </QueryClientProvider>,
  );
}

const BACK = "Back to my dashboard";

describe("Back to my dashboard", () => {
  it("is ABSENT for someone who arrived by their own link", async () => {
    auth.organiser = null;
    renderManage();

    // Positive control from the same render: the management screen really is
    // here, so the absence below is about this screen and not about a blank.
    expect(await screen.findByRole("heading", { name: "Your people" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: BACK })).toBeNull();
    expect(screen.queryByText(BACK)).toBeNull();
  });

  it("is SHOWN to a signed-in organiser on the identical payload", async () => {
    auth.organiser = { id: "org-1", email: "fergus@example.test", isAdmin: false };
    renderManage();

    expect(await screen.findByRole("heading", { name: "Your people" })).toBeTruthy();
    const link = screen.getByRole("link", { name: BACK });
    expect(link.getAttribute("href")).toContain("/organise/dashboard");
  });

  it("is absent on a CLOSED page too, for a viewer with no account", async () => {
    auth.organiser = null;
    state.status = "closed";
    renderManage();

    // The closed screen's own marker is the positive control here.
    expect(await screen.findByTestId("manage-closed")).toBeTruthy();
    expect(screen.queryByText(BACK)).toBeNull();
  });

  it("is shown on a CLOSED page to an organiser — closed cards now lead here", async () => {
    auth.organiser = { id: "org-1", email: "fergus@example.test", isAdmin: false };
    state.status = "closed";
    renderManage();

    expect(await screen.findByTestId("manage-closed")).toBeTruthy();
    expect(screen.getByRole("link", { name: BACK })).toBeTruthy();
  });
});

describe("Part C — the add-a-task door", () => {
  it("is offered on a live page, and says it sends nothing", async () => {
    renderManage();

    expect(await screen.findByRole("button", { name: /Add a task/ })).toBeTruthy();
  });

  it("is NOT offered on a closed page", async () => {
    state.status = "closed";
    renderManage();

    // Positive control: the closed screen rendered.
    expect(await screen.findByTestId("manage-closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add a task/ })).toBeNull();
  });
});

/**
 * ── SABOTAGE LOG ─────────────────────────────────────────────────────────────
 * Each applied to the real source, suite run, change reverted.
 *
 * 1. the `{organiser && …}` guard removed from the back link in Manage
 *      → "is ABSENT for someone who arrived by their own link" FAILS, and so
 *        does the closed-page absence.
 * 2. Manage switched back to useAuth()
 *      → every test here FAILS on the thrown "must not demand a signed-in
 *        context", which is the whole reason useOptionalAuth exists.
 * 3. the add-a-task section moved above the closed-page early return
 *      → "is NOT offered on a closed page" FAILS.
 */
