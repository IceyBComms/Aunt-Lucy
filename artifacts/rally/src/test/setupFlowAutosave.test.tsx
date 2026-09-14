/**
 * Fix 1, 14 Sep 2026 — a task card saves when you LEAVE it, and it stays put.
 *
 * Kate reproduced the old behaviour four times in one day (errand, child care,
 * meal, and again after merging): autosave fired ~1.2s after a card's fields
 * parsed, removed the card from the form, and committed "Errand — Mon 14 Sep ·
 * 00:30" while she was still typing the time.
 *
 * P2: the headline claim here is an ABSENCE — "nothing saved mid-typing" —
 * and an absence passes for free if the card never rendered, was never edited,
 * or the save path is broken outright. So every "did not save" is asserted
 * beside proof that the card was really edited and is really still there, and
 * beside a positive control showing the same card DOES save on the right
 * gesture. A guard that blocks every save passes every absence test and breaks
 * the product silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import OrganiseAddSlots from "@/pages/OrganiseAddSlots";
import { resetServer, server, slotPosts } from "./fakeOrganiserApi";

vi.mock("@/lib/api", () => import("./fakeOrganiserApi"));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "test-token", organiser: { email: "o@example.com" }, isLoading: false }),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function renderSlots() {
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

/** Move focus the way a person does, and let React see the blur it causes. */
function focus(el: Element) {
  act(() => (el as HTMLElement).focus());
}

function q<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

/** Somewhere to put focus that is NOT inside the card. */
const outside = () => screen.getByRole("button", { name: /Add another/ });

beforeEach(() => resetServer());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("autosave waits until you leave the card", () => {
  it("does NOT save while you are still in the card — and the card was really edited and is still there", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");

    // Kate's reproduction: an errand. That is a lift on this path, so it is
    // complete — and the old autosave would fire — once it has a wait answer
    // and a time.
    const errand = within(card).getByRole("button", { name: /Errand/ });
    focus(errand);
    fireEvent.click(errand);
    const waitAnswer = card.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")[0];
    focus(waitAnswer);
    fireEvent.click(waitAnswer);

    focus(q(card, 'input[type="date"]'));
    const time = q<HTMLInputElement>(card, 'input[type="time"]');
    focus(time); // Date → Time: a blur, but WITHIN the card.

    // Chromium's own events for typing "12:30" with AM/PM already set, one per
    // keystroke, as recorded on 14 Sep: "00:03", then "00:30".
    fireEvent.change(time, { target: { value: "00:03" } });
    fireEvent.change(time, { target: { value: "00:30" } });
    await sleep(1600); // comfortably past the old 1.2s idle autosave

    // The absence…
    expect(slotPosts()).toHaveLength(0);
    // …and the proof the path ran: same card node, edited, still a draft,
    // still editable, focus still inside it.
    expect(screen.getByTestId("slot-card")).toBe(card);
    expect(card.dataset.cardState).toBe("draft");
    expect(within(card).getByRole("button", { name: /Errand/ }).className).toContain(
      "border-primary",
    );
    expect(waitAnswer.getAttribute("aria-pressed")).toBe("true");
    expect(time.value).toBe("00:30");
    // :disabled, not .disabled — the lock is a disabled <fieldset>, which the
    // property does not reflect (checked in real Chromium, 14 Sep).
    expect(time.matches(":disabled")).toBe(false);
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it("DOES save when focus leaves the card — once, with what is on screen — and the card stays put", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    const notes = q<HTMLTextAreaElement>(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "No nuts, please" } });

    focus(outside()); // leaving the card

    await waitFor(() => expect(card.dataset.cardState).toBe("saved"));
    expect(slotPosts()).toHaveLength(1);
    expect(slotPosts()[0].body).toMatchObject({ slotType: "meal", notes: "No nuts, please" });

    // STAYS PUT: the very same DOM node, still showing what was typed, marked saved.
    expect(card.isConnected).toBe(true);
    expect(screen.getAllByTestId("slot-card")).toEqual([card]);
    expect(notes.value).toBe("No nuts, please");
    expect(within(card).getByTestId("card-saved")).toBeTruthy();
    // Locked: editing a saved card would be editing a copy nobody writes back.
    expect(notes.matches(":disabled")).toBe(true);

    // Leaving again writes nothing more.
    focus(screen.getByRole("button", { name: /Continue/ }));
    await sleep(50);
    expect(slotPosts()).toHaveLength(1);
    expect(card.isConnected).toBe(true);

    // It collapses only on an explicit action.
    fireEvent.click(outside());
    await waitFor(() => expect(card.isConnected).toBe(false));
    expect(screen.getByText("Already added")).toBeTruthy();
    const cards = screen.getAllByTestId("slot-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.cardState).toBe("draft");
    expect(slotPosts()).toHaveLength(1);
  });

  it("does not save a card nobody has touched, even when focus passes through it", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    focus(q(card, 'input[type="date"]'));
    focus(outside());
    await sleep(50);
    expect(slotPosts()).toHaveLength(0);
    expect(card.dataset.cardState).toBe("draft");

    // Positive control: the same card, once touched, saves on the same gesture.
    const notes = q(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "Soup" } });
    focus(outside());
    await waitFor(() => expect(slotPosts()).toHaveLength(1));
  });

  it("does not save when the WINDOW loses focus — switching apps is not leaving the card", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    const notes = q(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "Soup" } });

    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    focus(outside());
    await sleep(50);
    expect(slotPosts()).toHaveLength(0);
    expect(card.dataset.cardState).toBe("draft");

    // Positive control: back in the window, the same move saves.
    hasFocus.mockRestore();
    focus(notes);
    focus(outside());
    await waitFor(() => expect(slotPosts()).toHaveLength(1));
  });
});

describe("the 00:30 — a half-typed time is discarded, never coerced", () => {
  it("does not save a card whose time is half-typed — and does save it once the time is finished", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    const notes = q(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "Lasagne" } });

    const time = q<HTMLInputElement>(card, 'input[type="time"]');
    focus(time);
    // What a browser reports for "12:3- --": no value, badInput true. jsdom has
    // no segmented time field, so the flag is set by hand.
    Object.defineProperty(time, "validity", { configurable: true, value: { badInput: true } });
    focus(outside());
    await sleep(50);

    expect(slotPosts()).toHaveLength(0);
    expect(card.dataset.cardState).toBe("draft");
    // :disabled, not .disabled — the lock is a disabled <fieldset>, which the
    // property does not reflect (checked in real Chromium, 14 Sep).
    expect(time.matches(":disabled")).toBe(false);

    // Positive control: finish the time and leave again. It saves — with the
    // finished time, not anything guessed from the partial one.
    delete (time as unknown as { validity?: unknown }).validity;
    focus(time);
    fireEvent.change(time, { target: { value: "12:30" } });
    focus(outside());
    await waitFor(() => expect(slotPosts()).toHaveLength(1));
    expect(slotPosts()[0].body.slotTime).toBe("12:30");
    expect(server.page.slots[0].slotTime).toBe("12:30");
  });
});

describe("leave and come back", () => {
  it("a saved task is still there after a reload, and coming back re-posts nothing", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    const notes = q(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "Soup" } });
    focus(outside());
    await waitFor(() => expect(card.dataset.cardState).toBe("saved"));

    cleanup(); // the reload
    renderSlots();

    await screen.findByText("Already added");
    expect(screen.getByText("Meal")).toBeTruthy();
    expect(server.page.slots).toHaveLength(1);
    expect(slotPosts()).toHaveLength(1);
  });

  it("Continue arriving mid-autosave writes the task exactly once, then moves on", async () => {
    renderSlots();
    const card = await screen.findByTestId("slot-card");
    const notes = q(card, "textarea");
    focus(notes);
    fireEvent.change(notes, { target: { value: "Soup" } });

    const continueButton = screen.getByRole("button", { name: /Continue/ });
    focus(continueButton); // leaving the card starts an autosave…
    fireEvent.click(continueButton); // …and Continue lands while it is in flight

    await screen.findByTestId("step-3-stub");
    expect(slotPosts()).toHaveLength(1);
    expect(server.page.slots).toHaveLength(1);
  });
});
