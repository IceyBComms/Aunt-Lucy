/**
 * Fix 2, 14 Sep 2026 — going live is a deliberate act.
 *
 * OrganisePublish used to POST /publish in a mount effect: LOADING STEP 3 WAS
 * THE ACTIVATION. The button that led there said "Continue — publish page →",
 * and an old link, the back button or a refresh all did the same thing.
 *
 * P2: "loading step 3 does not publish" is an absence, and it passes for free
 * if step 3 never rendered at all. So each absence here is asserted together
 * with a marker only the draft step-3 screen renders AND the server's page
 * status — and beside the positive control: the button plus the confirm DOES
 * publish. A guard that blocks everything would pass every absence test here
 * and quietly stop anyone going live.
 *
 * The fake server's publish route calls the REAL canPublish from api-server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import OrganiseAddSlots from "@/pages/OrganiseAddSlots";
import OrganisePublish from "@/pages/OrganisePublish";
import { SETUP_PUBLISH_COPY as COPY } from "@/lib/setupPublishCopy";
import { apiFetch, publishPosts, resetServer, server } from "./fakeOrganiserApi";

vi.mock("@/lib/api", () => import("./fakeOrganiserApi"));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "test-token", organiser: { email: "o@example.com" }, isLoading: false }),
}));

const STEP_2 = "/organise/create/page-1/slots";
const STEP_3 = "/organise/create/page-1/publish";

const TASK = {
  id: "slot-1",
  slotType: "meal",
  customLabel: null,
  slotDate: "2026-09-20",
  slotTime: "18:00",
  trustedHelpersOnly: false,
  isClaimed: false,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function renderAt(path: string) {
  const { hook, navigate } = memoryLocation({ path });
  render(
    <Router hook={hook}>
      <Route path="/organise/create/:pageId/slots" component={OrganiseAddSlots} />
      <Route path="/organise/create/:pageId/publish" component={OrganisePublish} />
    </Router>,
  );
  return (to: string) => act(() => navigate(to));
}

beforeEach(() => resetServer({ slots: [TASK] }));
afterEach(() => cleanup());

describe("arriving at step 3 does not publish", () => {
  it("loading step 3 renders it — with the task on it — and the page is still a draft", async () => {
    renderAt(STEP_3);

    // Proof it RENDERED: the marker only the draft step-3 screen has, with the
    // page's own task and the go-live button on it.
    const step = await screen.findByTestId("publish-step");
    expect(within(step).getByText("Meal")).toBeTruthy();
    expect(within(step).getByRole("button", { name: COPY.step3Button })).toBeTruthy();

    await sleep(50); // any mount effect has had its chance
    // The absence, beside it.
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("draft");
    expect(screen.queryByTestId("publish-live")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Continue on step 2 lands on step 3 without publishing", async () => {
    renderAt(STEP_2);
    fireEvent.click(await screen.findByRole("button", { name: COPY.step2Continue }));

    await screen.findByTestId("publish-step");
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("draft");
  });

  it("the back button and an old link to step 3 do not publish either", async () => {
    const go = renderAt(STEP_3);
    await screen.findByTestId("publish-step");

    go(STEP_2); // back…
    await screen.findByRole("button", { name: COPY.step2Continue });
    go(STEP_3); // …and forward again
    await screen.findByTestId("publish-step");

    cleanup(); // a cold load of the same URL: an old link, a refresh
    renderAt(STEP_3);
    await screen.findByTestId("publish-step");

    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("draft");
  });
});

describe("going live takes the button AND the confirm", () => {
  it("the button alone publishes nothing; answering the confirm publishes — once", async () => {
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");

    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(COPY.confirmTitle("Nadia"))).toBeTruthy();
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("draft");

    // THE POSITIVE CONTROL: the guard discriminates, it does not just block.
    fireEvent.click(within(dialog).getByRole("button", { name: COPY.confirmYes }));
    const live = await screen.findByTestId("publish-live");
    expect(publishPosts()).toHaveLength(1);
    expect(server.page.status).toBe("active");
    expect(within(live).getByText(/\/s\/xK9mR2pQ4w$/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the confirm says 'Anyone with the link' — Kate's ruled wording, 14 Sep", async () => {
    resetServer({ privacy: "open", slots: [TASK] });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(COPY.confirmBody)).toBeTruthy();
    expect(within(dialog).getByText(/Anyone with the link/)).toBeTruthy();
  });

  it("a page still flagged pin_protected gets the SAME confirm — no PIN sentence", async () => {
    // There used to be a second variant here, shown when `privacy` was
    // "pin_protected", reading "Anyone with the link and your PIN…". The PIN
    // was dropped on 21 Sep 2026 (bug #129), so that sentence is now false of
    // every page — including the old rows that still carry the flag. This is
    // the test that would catch it coming back.
    resetServer({ privacy: "pin_protected", slots: [TASK] });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(COPY.confirmBody)).toBeTruthy();
    expect(within(dialog).queryByText(/your PIN/)).toBeNull();
  });

  it("'Not yet' closes the confirm and publishes nothing", async () => {
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: COPY.confirmNo }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("publish-step")).toBeTruthy();
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("draft");
  });

  it("coming back to step 3 after going live shows the link and never publishes again", async () => {
    resetServer({ status: "active", slots: [TASK] });
    renderAt(STEP_3);
    await screen.findByTestId("publish-live");
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(screen.queryByTestId("publish-step")).toBeNull();
  });

  it("if the page went live after this screen loaded, the confirm says it is already live — with the link beneath", async () => {
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    server.page.status = "active"; // made live in another tab after this screen loaded
    fireEvent.click(within(dialog).getByRole("button", { name: COPY.confirmYes }));
    expect(await within(dialog).findByText(COPY.notDraft)).toBeTruthy();
    expect(within(dialog).getByTestId("refusal-link").textContent).toMatch(/\/s\/xK9mR2pQ4w$/);
    expect(publishPosts()).toHaveLength(1); // one attempt, refused — not a second publish
  });

  it("a refusal for any other reason shows no link beneath — there is no live page to point at", async () => {
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    server.page.slots = []; // every task removed in another tab after this screen loaded
    fireEvent.click(within(dialog).getByRole("button", { name: COPY.confirmYes }));
    expect(await within(dialog).findByText(COPY.noTasks)).toBeTruthy();
    expect(within(dialog).queryByTestId("refusal-link")).toBeNull();
    expect(server.page.status).toBe("draft");
    expect(screen.queryByTestId("publish-live")).toBeNull();
  });
});

describe("pages that must not go live", () => {
  it("a draft with no tasks offers no way to go live — and the server refuses it anyway", async () => {
    resetServer({ slots: [] });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    expect(within(step).getByText(COPY.noTasks)).toBeTruthy();
    expect(within(step).queryByRole("button", { name: COPY.step3Button })).toBeNull();

    // The screen is the courtesy; the server is the guard. A request that
    // never saw the screen is refused just the same.
    await expect(
      apiFetch("/organiser/pages/page-1/publish", { method: "POST" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(server.page.status).toBe("draft");
  });

  it("a closed page is not reopened by a stale step-3 link", async () => {
    resetServer({ status: "closed", slots: [TASK] });
    renderAt(STEP_3);
    // Not reopened. The WORDING is deliberately not asserted: this screen shows
    // notDraft ("This page is already live."), which is wrong for a closed page.
    // Unreachable today because nothing writes `closed`; the thing to fix when
    // page closure ships (#090). A test must not lock in a sentence known false.
    expect(await screen.findByRole("button", { name: "Go to dashboard" })).toBeTruthy();
    expect(screen.queryByTestId("publish-live")).toBeNull();
    expect(screen.queryByTestId("publish-step")).toBeNull();
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("closed");
  });
});

/**
 * #113 — invitations are held until publish, and publishing sends them straight
 * away. So "Pressing this doesn't send anyone a message" is true only on a page
 * with nothing waiting. Each variant is asserted beside the other, both ways: a
 * screen that always showed one line would pass half of these and fail the rest.
 */
describe("step 3 says invitations will send — only when some are waiting", () => {
  it("with invitations waiting: the body and the confirm both say making it live sends them", async () => {
    resetServer({ privacy: "open", slots: [TASK], heldInviteCount: 2 });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    expect(within(step).getByText(COPY.step3BodyWithInvitations)).toBeTruthy();
    expect(within(step).queryByText(COPY.step3Body)).toBeNull();

    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(COPY.confirmBodyWithInvitations)).toBeTruthy();
    expect(within(dialog).queryByText(COPY.confirmBody)).toBeNull();
  });

  it("a page flagged pin_protected WITH invitations gets the same sending line", async () => {
    // The other half of the dropped variant (#129): the flag changes nothing
    // here either, and no confirm on any page mentions a PIN.
    resetServer({ privacy: "pin_protected", slots: [TASK], heldInviteCount: 1 });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(COPY.confirmBodyWithInvitations)).toBeTruthy();
    expect(within(dialog).queryByText(/your PIN/)).toBeNull();
  });

  it("with none waiting: the lines that say nothing is sent — true on this page", async () => {
    resetServer({ privacy: "open", slots: [TASK], heldInviteCount: 0 });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    expect(within(step).getByText(COPY.step3Body)).toBeTruthy();
    expect(within(step).queryByText(COPY.step3BodyWithInvitations)).toBeNull();

    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(COPY.confirmBody)).toBeTruthy();
    expect(within(dialog).queryByText(COPY.confirmBodyWithInvitations)).toBeNull();
  });

  it("the ruled words are the ones on screen", () => {
    // Kate's ruling, 14 Sep, with both amendments. Pinned here so a copy edit
    // is a deliberate act, not a drift.
    expect(COPY.step3BodyWithInvitations).toBe(
      "Nothing's live yet, and no one's been invited. Have a last look — when you make it live, Aunt Lucy will send the invitations you've added.",
    );
    expect(COPY.confirmBodyWithInvitations).toBe(
      "Anyone with the link will be able to see the page and offer to help. Making it live sends the invitations you've added. Everyone else sees the page when you share the link.",
    );
    // Her ruled wording is UNCHANGED by #129 — only the second, PIN variant
    // was removed. Neither confirm may mention a code again.
    expect(COPY.confirmBody).not.toMatch(/PIN/);
    expect(COPY.confirmBodyWithInvitations).not.toMatch(/PIN/);
  });
});
