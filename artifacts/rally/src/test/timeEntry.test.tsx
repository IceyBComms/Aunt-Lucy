/**
 * ROW #144 — A HALF-TYPED TIME IS NOT AN EMPTY ONE, ON EITHER DOOR.
 *
 * Kate, testing on production 21 September 2026: a time typed but not finished
 * — an hour with no am/pm — was thrown away, and the task saved as "Any time
 * that day" with nothing said. Both add-a-task doors read `value || null`, and
 * a Chromium time input reports `value === ""` for a half-typed box exactly as
 * it does for an untouched one. The only difference between the two is
 * `validity.badInput`, and nothing read it before saving.
 *
 * ⚠️ HOW THE HALF-TYPED STATE IS MADE HERE. `validity` is read-only and
 * browser-owned; jsdom will not produce badInput from a keystroke, and there is
 * no value to type that means "unfinished". So these tests DEFINE the property
 * on the real input — which is the honest limit of this file, stated rather
 * than buried: what is proved is that the guard reads badInput and refuses, not
 * that Chromium sets it. That second half is row #111's finding, reproduced by
 * Kate in a real browser and recorded there.
 *
 * ⚠️ P2. The headline claims are ABSENCES — "nothing was written". An absence
 * passes for free against a form that saves nothing at all, so every refusal
 * sits beside a positive control FROM THE SAME FORM: an EMPTY time box still
 * saves (as "Any time that day"), and a COMPLETE one still saves with its time.
 * A guard that blocked everything would fail both.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PARTIAL_TIME_MESSAGE } from "@/lib/partialTime";
import { resetServer, slotPosts } from "./fakeOrganiserApi";

/**
 * Make a real input report what Chromium reports for "12:-- --": an empty
 * value, and badInput set. Reversible, so the same box can be finished off.
 */
function setBadInput(el: HTMLInputElement, bad: boolean) {
  Object.defineProperty(el, "validity", {
    configurable: true,
    value: { badInput: bad, valid: !bad },
  });
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

// ─── DOOR 1: the /manage add-task form ───────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    organiser: { email: "o@example.com" },
    isLoading: false,
  }),
  useOptionalAuth: () => null,
}));

vi.mock("@/lib/api", () => import("./fakeOrganiserApi"));

const { Manage } = await import("@/pages/Manage");
const { default: OrganiseAddSlots } = await import("@/pages/OrganiseAddSlots");

const MANAGE_PAYLOAD = {
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

/** Every POST the add-task form actually made. The journal an absence needs. */
const posts = vi.hoisted(() => ({ tasks: [] as any[] }));

beforeEach(() => {
  posts.tasks = [];
  resetServer();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/manage/") && url.endsWith("/tasks") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      posts.tasks.push(body);
      return new Response(
        JSON.stringify({
          id: "slot-new",
          slotType: body.slotType,
          label: "Meal",
          customLabel: null,
          notes: null,
          flexibility: body.flexibility ?? "fixed",
          trustedHelpersOnly: false,
          isClaimed: false,
          claimedByName: null,
          claimedNote: null,
          claimedAt: null,
          slotDate: body.slotDate,
          slotTime: body.slotTime,
          liftWaitMode: null,
          dietaryNotes: null,
          headcount: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/api/manage/")) {
      return new Response(JSON.stringify(MANAGE_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Open "Add a task", give it a date, and hand back its time box. */
async function openAddTaskForm(): Promise<HTMLInputElement> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Router hook={(() => ["/manage/tok", () => {}]) as never}>
        <Route path="/manage/:token" component={Manage} />
      </Router>
    </QueryClientProvider>,
  );
  const open = await screen.findByRole("button", { name: /Add a task/i });
  fireEvent.click(open);
  await screen.findByRole("button", { name: /Add to the page/i });
  const dateInput = q<HTMLInputElement>(document.body, 'input[type="date"]');
  fireEvent.change(dateInput, { target: { value: "2026-09-23" } });
  return q<HTMLInputElement>(document.body, 'input[type="time"]');
}

const addButton = () => screen.getByRole("button", { name: /Add to the page/i });

describe("row #144, door 1 — the /manage add-task form", () => {
  it("a half-typed time BLOCKS the save, says so beside the box, and keeps the focus", async () => {
    const time = await openAddTaskForm();
    setBadInput(time, true);
    act(() => time.focus());

    fireEvent.click(addButton());

    // The absence…
    expect(posts.tasks).toHaveLength(0);
    // …with Kate's sentence, beside that box…
    expect(screen.getByTestId("add-task-time-help").textContent).toBe(PARTIAL_TIME_MESSAGE);
    expect(time.getAttribute("aria-describedby")).toBe("add-task-time-help");
    expect(time.getAttribute("aria-invalid")).toBe("true");
    // …and focus left where the person was.
    expect(document.activeElement).toBe(time);
    // Positive control FROM THE SAME RENDER: the form really is open, and the
    // button pressed really is the one that saves.
    expect(addButton().isConnected).toBe(true);
  });

  it("an EMPTY time box still saves, as 'Any time that day'", async () => {
    const time = await openAddTaskForm();
    setBadInput(time, false);

    fireEvent.click(addButton());

    await waitFor(() => expect(posts.tasks).toHaveLength(1));
    expect(posts.tasks[0].slotTime).toBeNull();
    expect(screen.queryByTestId("add-task-time-help")).toBeNull();
  });

  it("a COMPLETE time still saves, with its time", async () => {
    const time = await openAddTaskForm();
    setBadInput(time, false);
    fireEvent.change(time, { target: { value: "16:00" } });

    fireEvent.click(addButton());

    await waitFor(() => expect(posts.tasks).toHaveLength(1));
    expect(posts.tasks[0].slotTime).toBe("16:00");
  });

  it("finishing the time clears the message — it never outlives the problem", async () => {
    const time = await openAddTaskForm();
    setBadInput(time, true);
    fireEvent.click(addButton());
    expect(screen.getByTestId("add-task-time-help")).toBeTruthy();

    setBadInput(time, false);
    fireEvent.change(time, { target: { value: "16:00" } });
    expect(screen.queryByTestId("add-task-time-help")).toBeNull();

    fireEvent.click(addButton());
    await waitFor(() => expect(posts.tasks).toHaveLength(1));
    expect(posts.tasks[0].slotTime).toBe("16:00");
  });
});

// ─── DOOR 2: the setup wizard's task cards ───────────────────────────────────

function renderWizard() {
  const { hook } = memoryLocation({ path: "/organise/create/page-1/slots" });
  render(
    <Router hook={hook}>
      <Route path="/organise/create/:pageId/slots" component={OrganiseAddSlots} />
      <Route path="/organise/create/:pageId/publish">
        <p data-testid="step-3-stub" />
      </Route>
    </Router>,
  );
}

/** Somewhere to put focus that is NOT inside the card. */
const outside = () => screen.getByRole("button", { name: /Add another/ });

describe("row #144, door 2 — the setup wizard's task cards", () => {
  it("Continue with a half-typed time writes nothing, says so beside the box, and focuses it", async () => {
    renderWizard();
    const card = await screen.findByTestId("slot-card");
    fireEvent.change(q<HTMLInputElement>(card, 'input[type="date"]'), {
      target: { value: "2026-09-23" },
    });
    const time = q<HTMLInputElement>(card, 'input[type="time"]');
    setBadInput(time, true);

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    // The absence…
    expect(slotPosts()).toHaveLength(0);
    // …and the two things the person is owed.
    await waitFor(() =>
      expect(within(card).getByTestId("slot-time-help").textContent).toBe(
        PARTIAL_TIME_MESSAGE,
      ),
    );
    expect(document.activeElement).toBe(time);
    // Positive control FROM THE SAME RENDER: the card is still a draft and
    // still on screen, so "nothing saved" is not "nothing rendered".
    expect(card.dataset.cardState).toBe("draft");
    expect(screen.queryByTestId("step-3-stub")).toBeNull();
  });

  it("leaving a card with a half-typed time does not save it, and no longer does so in silence", async () => {
    renderWizard();
    const card = await screen.findByTestId("slot-card");
    const notes = q<HTMLTextAreaElement>(card, "textarea");
    act(() => notes.focus());
    fireEvent.change(notes, { target: { value: "No nuts, please" } });

    const time = q<HTMLInputElement>(card, 'input[type="time"]');
    setBadInput(time, true);
    act(() => time.focus());
    act(() => outside().focus());

    await waitFor(() =>
      expect(within(card).getByTestId("slot-time-help").textContent).toBe(
        PARTIAL_TIME_MESSAGE,
      ),
    );
    expect(slotPosts()).toHaveLength(0);
    expect(card.dataset.cardState).toBe("draft");
  });

  it("leaving a card with an EMPTY time box still saves it — the positive control", async () => {
    renderWizard();
    const card = await screen.findByTestId("slot-card");
    const notes = q<HTMLTextAreaElement>(card, "textarea");
    act(() => notes.focus());
    fireEvent.change(notes, { target: { value: "No nuts, please" } });
    act(() => outside().focus());

    await waitFor(() => expect(card.dataset.cardState).toBe("saved"));
    expect(slotPosts()).toHaveLength(1);
    expect(within(card).queryByTestId("slot-time-help")).toBeNull();
  });

  it("Continue with no half-typed time gets through to step 3 — the other positive control", async () => {
    renderWizard();
    const card = await screen.findByTestId("slot-card");
    const notes = q<HTMLTextAreaElement>(card, "textarea");
    act(() => notes.focus());
    fireEvent.change(notes, { target: { value: "No nuts, please" } });

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(screen.getByTestId("step-3-stub")).toBeTruthy());
    expect(slotPosts()).toHaveLength(1);
  });
});
