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

/**
 * Every POST the add-task form made, every PATCH the edit dialog made, and —
 * for door 3 — the row the server actually holds.
 *
 * `stored` is a real server-side value, not a journal entry, because Kate's
 * ruling for the edit dialog is about what SURVIVES: "keeps the existing time
 * exactly as it was". A test that only counted requests would pass against a
 * PATCH that fired and wrote null.
 */
const posts = vi.hoisted(() => ({
  tasks: [] as any[],
  patches: [] as any[],
  stored: null as any,
}));

/** The saved task door 3 edits: a school run at 3:15pm. */
function storedTask() {
  return {
    id: "slot-1",
    slotType: "school_pickup",
    label: "School run",
    customLabel: null,
    notes: null,
    flexibility: "fixed",
    trustedHelpersOnly: true,
    isClaimed: false,
    claimedByName: null,
    claimedNote: null,
    claimedAt: null,
    slotDate: "2026-09-23",
    slotTime: "15:15",
    liftWaitMode: null,
    dietaryNotes: null,
    headcount: null,
  };
}

beforeEach(() => {
  posts.tasks = [];
  posts.patches = [];
  posts.stored = null;
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
    if (url.includes("/api/manage/") && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      posts.patches.push(body);
      // A real write: whatever the dialog sent is what the row now holds. This
      // is what makes "the 3:15 survived" a fact about the server rather than
      // a fact about the request count.
      Object.assign(posts.stored, body);
      return new Response(JSON.stringify(posts.stored), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/manage/")) {
      return new Response(
        JSON.stringify({
          ...MANAGE_PAYLOAD,
          tasks: posts.stored ? [posts.stored] : [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
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

/**
 * Let anything the click STARTED actually finish.
 *
 * A save is a react-query mutation: an unguarded one fires its request a tick
 * after the click, so "nothing was written" asserted immediately is a claim
 * about the clock, not about the code. The sabotage run proved this is not
 * theoretical — with the guard removed, the row was STILL untouched at the
 * moment of assertion, and only the missing message gave it away. P2's
 * green-by-default, in this file. Everything here is in-memory, so a macrotask
 * is long enough for a real write to land and be seen.
 */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe("row #144, door 1 — the /manage add-task form", () => {
  it("a half-typed time BLOCKS the save, says so beside the box, and keeps the focus", async () => {
    const time = await openAddTaskForm();
    setBadInput(time, true);
    act(() => time.focus());

    fireEvent.click(addButton());
    await settle(); // or "nothing was posted" is a claim about the clock

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
    await settle(); // or "nothing was posted" is a claim about the clock

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
    await settle();
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

// ─── DOOR 3: the EDIT-a-task dialog on /manage ───────────────────────────────
//
// Kate's ruling, 21 September 2026, once the first two doors were built: the
// same guard and the same sentence here. This door is the one with something to
// lose — the other two save a task with no time, this one wrote null OVER a
// time that already existed. So the claim these tests make is not "no request
// was sent", it is "the 3:15 is still there", asserted against the row the fake
// server actually holds.
//
// ⚠️ P2 again. "The time survived" would pass for free against a dialog whose
// save button does nothing at all, so both positive controls are here: a
// COMPLETE new time really does replace it, and a fully CLEARED box really does
// write null ("Any time that day"). A guard that blocked everything would fail
// both.

/** Open the saved 3:15pm task's edit dialog, and hand back its time box. */
async function openEditDialog(): Promise<HTMLInputElement> {
  posts.stored = storedTask();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Router hook={(() => ["/manage/tok", () => {}]) as never}>
        <Route path="/manage/:token" component={Manage} />
      </Router>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Change this task/i }));
  // The dialog carries no role="dialog" (components/ui/dialog-framer.tsx is a
  // plain framer-motion panel), so it is found by its own heading. While it is
  // open the add-task form is closed, which makes the ONE time box in the
  // document its own.
  await screen.findByRole("heading", { name: /Change this task/i });
  const time = q<HTMLInputElement>(document.body, 'input[type="time"]');
  // The dialog really did open on the stored value — without this, every
  // assertion below would be about a box that had never held 3:15pm.
  expect(time.value).toBe("15:15");
  return time;
}

const updateButton = () => screen.getByRole("button", { name: /Update the task/i });

describe("row #144, door 3 — the edit-a-task dialog on /manage", () => {
  it("half-typing over a saved 3:15pm and pressing save LEAVES 3:15pm stored", async () => {
    const time = await openEditDialog();
    // What Chromium reports mid-correction: the old value gone from `value`,
    // badInput set, and no change event to tell React anything happened.
    setBadInput(time, true);
    act(() => time.focus());

    fireEvent.click(updateButton());

    // ⚠️ SETTLE FIRST, AND THIS LINE IS THE WHOLE TEST.
    //
    // The save is a mutation, so a PATCH fired by an UNGUARDED dialog lands a
    // tick or two after the click. Asserting straight after the click found
    // the row still holding "15:15" whatever the code did — the sabotage run
    // proved it, going red only on the MESSAGE while the two assertions this
    // test exists for passed on timing alone. That is P2's green-by-default
    // exactly, and it was in this file.
    await settle();

    // The thing that matters: the row is untouched. Not null, not coerced.
    expect(posts.stored.slotTime).toBe("15:15");
    // And nothing was even attempted, which is what leaves it untouched.
    expect(posts.patches).toHaveLength(0);
    // Kate's sentence, beside that box, with the focus still in it.
    expect(screen.getByTestId("edit-task-time-help").textContent).toBe(PARTIAL_TIME_MESSAGE);
    expect(time.getAttribute("aria-describedby")).toBe("edit-task-time-help");
    expect(time.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(time);
  });

  it("a COMPLETE new time really does replace it — the positive control", async () => {
    const time = await openEditDialog();
    setBadInput(time, false);
    fireEvent.change(time, { target: { value: "15:45" } });

    fireEvent.click(updateButton());

    await waitFor(() => expect(posts.patches).toHaveLength(1));
    expect(posts.stored.slotTime).toBe("15:45");
  });

  it("a fully CLEARED box still means 'Any time that day' — the other control", async () => {
    const time = await openEditDialog();
    setBadInput(time, false);
    fireEvent.change(time, { target: { value: "" } });

    fireEvent.click(updateButton());

    await waitFor(() => expect(posts.patches).toHaveLength(1));
    // An empty box is an ANSWER; a half-typed one is not. This is the
    // distinction the guard exists to draw, and the line it must not cross.
    expect(posts.stored.slotTime).toBeNull();
  });

  it("finishing the time clears the message, and the save then goes through", async () => {
    const time = await openEditDialog();
    setBadInput(time, true);
    fireEvent.click(updateButton());
    expect(screen.getByTestId("edit-task-time-help")).toBeTruthy();
    await settle();
    expect(posts.stored.slotTime).toBe("15:15");

    setBadInput(time, false);
    fireEvent.change(time, { target: { value: "15:45" } });
    expect(screen.queryByTestId("edit-task-time-help")).toBeNull();

    fireEvent.click(updateButton());
    await waitFor(() => expect(posts.stored.slotTime).toBe("15:45"));
  });
});
