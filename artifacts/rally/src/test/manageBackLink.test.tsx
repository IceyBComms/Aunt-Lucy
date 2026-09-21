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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe('Part C — "Does the time matter?" starts from the task type', () => {
  /** The answer currently showing, read off the pressed state of the two pills. */
  function chosenAnswer(): string | null {
    for (const label of ["Yes, that time", "Roughly then is fine"]) {
      const btn = screen.queryByRole("button", { name: label });
      if (btn?.getAttribute("aria-pressed") === "true") return label;
    }
    return null;
  }

  async function openForm() {
    renderManage();
    const open = await screen.findByRole("button", { name: /Add a task/ });
    fireEvent.click(open);
    // Positive control: the form really opened, so a null answer below would
    // mean "nothing is selected", not "nothing rendered".
    expect(await screen.findByText("What kind of help?")).toBeTruthy();
  }

  it("a MEAL is flexible by default — the same answer the wizard gives it", async () => {
    await openForm();

    // The form opens on Meal, and a meal's time is the helper's to nudge.
    // Before this, the form always opened on "Yes, that time", so the identical
    // meal came out fixed from /manage and flexible from setup.
    expect(chosenAnswer()).toBe("Roughly then is fine");
  });

  it("choosing a SCHOOL RUN moves the answer to fixed", async () => {
    await openForm();
    expect(chosenAnswer()).toBe("Roughly then is fine");

    fireEvent.click(screen.getByRole("button", { name: /School Run/ }));

    // A school run's time is the family's fact, not a helper's to shift.
    expect(chosenAnswer()).toBe("Yes, that time");
  });

  it("a dated ERRAND — a lift — is fixed", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: /Errand/ }));

    expect(chosenAnswer()).toBe("Yes, that time");
  });

  it("once the person answers it themselves, changing the type does NOT overwrite them", async () => {
    await openForm();

    // They deliberately say the time matters for this meal.
    fireEvent.click(screen.getByRole("button", { name: "Yes, that time" }));
    expect(chosenAnswer()).toBe("Yes, that time");

    // Now they change their mind about the KIND of task. Shopping's default is
    // flexible — and it must not silently undo what they just said.
    fireEvent.click(screen.getByRole("button", { name: /Shopping/ }));
    expect(chosenAnswer()).toBe("Yes, that time");
  });

  it("reopening the form starts from the default again", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Yes, that time" }));
    expect(chosenAnswer()).toBe("Yes, that time");

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    fireEvent.click(await screen.findByRole("button", { name: /Add a task/ }));

    // A new task is a new question — the last one's answer is not carried over.
    expect(chosenAnswer()).toBe("Roughly then is fine");
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
 * 4. openAddTask() reseeds the answer to a flat "fixed" instead of the task
 *    type's default
 *      → "a MEAL is flexible by default" FAILS, and so do the school-run and
 *        reopen cases. ⚠️ Note for whoever changes this: sabotaging the
 *        useState INITIALISER instead does NOT go red, and that is correct —
 *        the form is only ever reached through openAddTask, which reseeds
 *        before anything is on screen. The reset is the line that decides.
 * 5. the `!newFlexibilityTouched` guard removed, so changing the task type
 *    overwrites an answer the person gave
 *      → "once the person answers it themselves…" FAILS.
 * 6. rally's DATED_SLOT_FLEXIBILITY drifts from the server (meal → fixed)
 *      → api-server's slotFlexibilityDrift FAILS on two counts, which is the
 *        whole reason that cross-package test exists.
 */
