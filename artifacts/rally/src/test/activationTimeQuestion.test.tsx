/**
 * ROW #143, THE SECOND DOOR — the setup wizard's task cards.
 *
 * Kate's ruling names BOTH doors, and a fix on one is exactly how the eight
 * task-name tables happened: each was right where it was written, and nothing
 * compared them. So the same question, in the same words, appears on the
 * recipient's activation screen — and, like /manage, only once a time exists.
 *
 * ⚠️ P2. "The question is absent" passes for free against a screen that
 * rendered nothing, so every absence here is asserted beside a positive control
 * from the SAME render (the card's own time input, which is right above it),
 * and beside the mirror test where entering a time DOES show it.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const review = vi.hoisted(() => ({
  data: null as unknown,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetGiftReview: () => ({
    data: review.data,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
  useActivateGift: () => ({ mutate: () => {}, isPending: false, isError: false }),
  getGetGiftReviewQueryKey: (token: string) => ["gift", token],
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: () => {} }) };
});

const { GiftActivation } = await import("@/components/GiftActivation");

/** One undated meal suggestion — the shape the activation screen is handed. */
const MEAL = {
  key: "nb_meal",
  slotType: "meal",
  label: "A meal for the freezer",
  dated: false,
  trustedHelpersOnly: false,
};

beforeEach(() => {
  review.data = {
    activated: false,
    status: "draft",
    slug: null,
    scheduledActivateAt: null,
    manageToken: null,
    recipientName: "Tammy Hughes",
    recipientEmail: null,
    occasion: "new_baby",
    suggestions: [MEAL],
  };
});

afterEach(cleanup);

/** Render, then open the one task card for editing — where the time lives. */
function openTheTaskForEditing() {
  render(<GiftActivation token="tok" />);
  fireEvent.click(screen.getByRole("button", { name: /Change|Edit/i }));
}

describe("Row #143 — the wizard asks about the time only once there is one", () => {
  const QUESTION = "Does it need to be at that time?";

  it("a DATE has to exist before a time can — the card starts with neither", () => {
    openTheTaskForEditing();

    // Positive control: the card really is open for editing.
    expect(screen.getByLabelText("What would help")).toBeTruthy();
    // An undated task is a flexible offer with no clock at all, so neither the
    // time nor the question about it is on screen.
    expect(screen.queryByLabelText("Pickup time")).toBeNull();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("with a date but NO time: the time input is there, the question is not", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });

    // Positive control, from this same render: the time input IS on screen, so
    // the absent question below is a decision rather than an empty page.
    expect(screen.getByLabelText("Pickup time")).toBeTruthy();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.queryByRole("button", { name: "Yes, at that time" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Around then is fine" })).toBeNull();
  });

  it("the moment a time is entered, the question appears", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time"), {
      target: { value: "15:00" },
    });

    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, at that time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Around then is fine" })).toBeTruthy();
  });

  it("it starts on the TASK TYPE's own answer — a meal is 'around then'", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time"), {
      target: { value: "15:00" },
    });

    // The same default the server would have chosen, and the same one /manage
    // seeds — one rule, in @workspace/task-copy, that both doors import.
    expect(
      screen.getByRole("button", { name: "Around then is fine" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Yes, at that time" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("the answer can be changed, and it sticks", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time"), {
      target: { value: "15:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Yes, at that time" }));

    expect(
      screen.getByRole("button", { name: "Yes, at that time" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("clearing the time takes the question away again", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time"), {
      target: { value: "15:00" },
    });
    expect(screen.getByText(QUESTION)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Pickup time"), { target: { value: "" } });
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("the old wording is nowhere on this screen either", () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time"), {
      target: { value: "15:00" },
    });

    expect(document.body.textContent).not.toContain("Does the time matter?");
    expect(document.body.textContent).not.toContain("Roughly then is fine");
  });
});

describe("Row #143 — a dated task with no time says so, in the shared words", () => {
  it('the task card reads "Any time that day", never "Time to be confirmed"', () => {
    openTheTaskForEditing();
    fireEvent.change(screen.getByLabelText("A specific date, if it needs one"), {
      target: { value: "2026-09-22" },
    });
    // Leave editing, so the card shows its summary pills.
    fireEvent.click(screen.getByRole("button", { name: /Done|Save/i }));

    expect(document.body.textContent).toContain("Any time that day");
    expect(document.body.textContent).not.toContain("Time to be confirmed");
  });
});
