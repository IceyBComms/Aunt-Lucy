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

  it("the confirm says 'Anyone with the link' on a page with no PIN — and not the PIN variant", async () => {
    resetServer({ privacy: "open", slots: [TASK] });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(COPY.confirmBody.open)).toBeTruthy();
    expect(within(dialog).queryByText(COPY.confirmBody.pinProtected)).toBeNull();
  });

  it("the confirm says 'Anyone with the link and your PIN' on a PIN page — and not the open variant", async () => {
    // Kate's ruling, 14 Sep: keep "Anyone with the link" — a link can be
    // forwarded — and close the PIN gap with a second, true variant.
    resetServer({ privacy: "pin_protected", slots: [TASK] });
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(COPY.confirmBody.pinProtected)).toBeTruthy();
    expect(within(dialog).queryByText(COPY.confirmBody.open)).toBeNull();
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

  it("if the server refuses at the confirm, the refusal is shown and nothing goes live", async () => {
    renderAt(STEP_3);
    const step = await screen.findByTestId("publish-step");
    fireEvent.click(within(step).getByRole("button", { name: COPY.step3Button }));
    const dialog = await screen.findByRole("dialog");

    server.page.status = "closed"; // closed in another tab after this screen loaded
    fireEvent.click(within(dialog).getByRole("button", { name: COPY.confirmYes }));
    expect(await within(dialog).findByText(COPY.notDraft)).toBeTruthy();
    expect(publishPosts()).toHaveLength(1);
    expect(server.page.status).toBe("closed");
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
    expect(await screen.findByText(COPY.notDraft)).toBeTruthy();
    expect(screen.queryByTestId("publish-step")).toBeNull();
    await sleep(50);
    expect(publishPosts()).toHaveLength(0);
    expect(server.page.status).toBe("closed");
  });
});
