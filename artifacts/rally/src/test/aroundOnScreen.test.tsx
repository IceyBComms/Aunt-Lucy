/**
 * ROW #145 — EVERY SCREEN A HELPER OR THE FAMILY READS SAYS "around".
 *
 * Kate's sighting, 21 September 2026: a dated errand with a time of 4:00 PM,
 * marked "Around then is fine", whose PUBLIC CARD read "4:00pm" — the same
 * words a school run gets, on the screen a stranger is asked to plan their
 * afternoon from. The answer was stored correctly the whole time; no screen
 * ever looked at it.
 *
 * These render the REAL components — the public page's card, the invite page,
 * the release page, the manage screen — rather than reading a copy module as
 * text, because the fault was never in the copy: it was in what each screen
 * asked for. The server's messages have their own file
 * (api-server/src/lib/aroundSurfaces.test.ts).
 *
 * ⚠️ P2. "the fixed one does not say around" passes for free against a screen
 * that renders nothing, so every negative sits beside the positive from the
 * SAME component and the same props — and the time itself is asserted present
 * either way, so a card that lost its whole when-line would fail.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. No
 * assertion below matches across a line break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import type { SlotFlexibility } from "@workspace/task-copy";

/** Kate's own case. */
const DATE = "2026-09-23";
const TIME = "16:00";
const CARD_FLEXIBLE = "Wednesday 23 September · around 4:00pm";
const CARD_FIXED = "Wednesday 23 September · 4:00pm";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => {
    throw new Error("these screens must not demand a signed-in context");
  },
  useOptionalAuth: () => null,
}));

const api = vi.hoisted(() => ({ invite: null as any, release: null as any }));

vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string) => {
    if (path.startsWith("/invite/")) return api.invite;
    if (path.startsWith("/slots/release/") || path.startsWith("/release/")) {
      return api.release;
    }
    throw new Error(`unexpected ${path}`);
  },
  ApiError: class ApiError extends Error {},
}));

const { SlotCard } = await import("@/components/SlotCard");
const { default: InviteClaim } = await import("@/pages/InviteClaim");
const { default: ReleaseSlot } = await import("@/pages/ReleaseSlot");
const { Manage } = await import("@/pages/Manage");

/** Everything on screen, with the whitespace a DOM render scatters collapsed. */
const flat = () => document.body.textContent!.replace(/\s+/g, " ");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── The public page's task card — the screen Kate was reading ───────────────

function publicSlot(flexibility: SlotFlexibility, slotTime: string | null = TIME) {
  return {
    id: "slot-1",
    pageId: "page-1",
    slotType: "errand" as const,
    customLabel: null,
    slotDate: DATE,
    slotTime,
    flexibility,
    liftWaitMode: null,
    notes: null,
    dietaryNotes: null,
    headcount: null,
    isClaimed: false,
    claimedByName: null,
    claimedNote: null,
    createdAt: "2026-09-21T00:00:00.000Z",
  };
}

describe("the public page's card", () => {
  it("reads 'around 4:00pm' when the family said the time can move", () => {
    render(<SlotCard slot={publicSlot("flexible")} onClaim={() => {}} index={0} />);
    expect(flat()).toContain(CARD_FLEXIBLE);
  });

  it("reads a plain '4:00pm' when it cannot — the positive control", () => {
    render(<SlotCard slot={publicSlot("fixed")} onClaim={() => {}} index={0} />);
    expect(flat()).toContain(CARD_FIXED);
    expect(flat()).not.toContain("around");
  });

  it("an UNTIMED task still reads 'Any time that day', and never 'around'", () => {
    render(<SlotCard slot={publicSlot("flexible", null)} onClaim={() => {}} index={0} />);
    expect(flat()).toContain("Wednesday 23 September · Any time that day");
    expect(flat()).not.toContain("around");
  });
});

// ─── The invite page ─────────────────────────────────────────────────────────

function renderInvite(flexibility: SlotFlexibility) {
  api.invite = {
    pageLive: true,
    inviteId: "inv-1",
    helperName: "Jane",
    alreadyClaimed: false,
    claimedByYou: false,
    slot: {
      id: "slot-1",
      slotType: "errand",
      customLabel: null,
      slotDate: DATE,
      slotTime: TIME,
      flexibility,
      liftWaitMode: null,
      notes: null,
    },
    page: {
      recipientName: "Tammy Hughes",
      location: null,
      situationDescription: null,
      slug: "xK9mR2pQ4w",
    },
  };
  render(
    <Router hook={(() => ["/invite/tok", () => {}]) as never}>
      <Route path="/invite/:token" component={InviteClaim} />
    </Router>,
  );
}

describe("the invite page", () => {
  it("says 'around 4:00pm' to a trusted helper", async () => {
    renderInvite("flexible");
    await waitFor(() => expect(flat()).toContain(CARD_FLEXIBLE));
  });

  it("says a plain '4:00pm' for a fixed task", async () => {
    renderInvite("fixed");
    await waitFor(() => expect(flat()).toContain(CARD_FIXED));
    expect(flat()).not.toContain("around");
  });
});

// ─── The release page ────────────────────────────────────────────────────────

function renderRelease(flexibility: SlotFlexibility) {
  api.release = {
    slot: {
      id: "slot-1",
      slotType: "errand",
      customLabel: null,
      slotDate: DATE,
      slotTime: TIME,
      liftWaitMode: null,
      notes: null,
      flexibility,
      claimedNote: null,
    },
    helperName: "Jane",
    page: { recipientName: "Tammy Hughes", location: null, slug: "xK9mR2pQ4w" },
  };
  render(
    <Router hook={(() => ["/release/tok", () => {}]) as never}>
      <Route path="/release/:token" component={ReleaseSlot} />
    </Router>,
  );
}

describe("the release page", () => {
  it("says 'around 4:00pm' for a flexible task", async () => {
    renderRelease("flexible");
    await waitFor(() => expect(flat()).toContain(CARD_FLEXIBLE));
  });

  it("says a plain '4:00pm' for a fixed task", async () => {
    renderRelease("fixed");
    await waitFor(() => expect(flat()).toContain(CARD_FIXED));
    expect(flat()).not.toContain("around");
  });
});

// ─── The manage screen — what the family reads back ──────────────────────────

const MANAGE_BASE = {
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
  contacts: [],
  invites: [],
};

function renderManage(flexibility: SlotFlexibility) {
  vi.stubGlobal("fetch", async () =>
    new Response(
      JSON.stringify({
        ...MANAGE_BASE,
        tasks: [
          {
            id: "slot-1",
            slotType: "errand",
            label: "Errand",
            customLabel: null,
            notes: null,
            flexibility,
            trustedHelpersOnly: false,
            isClaimed: false,
            claimedByName: null,
            claimedNote: null,
            claimedAt: null,
            slotDate: DATE,
            slotTime: TIME,
            liftWaitMode: null,
            dietaryNotes: null,
            headcount: null,
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Router hook={(() => ["/manage/tok", () => {}]) as never}>
        <Route path="/manage/:token" component={Manage} />
      </Router>
    </QueryClientProvider>,
  );
}

describe("the manage screen", () => {
  it("shows the family the same words their helpers will read", async () => {
    renderManage("flexible");
    await waitFor(() => expect(flat()).toContain(CARD_FLEXIBLE));
  });

  it("a fixed task reads plain — the positive control", async () => {
    renderManage("fixed");
    await waitFor(() => expect(flat()).toContain(CARD_FIXED));
    expect(flat()).not.toContain("· around");
  });
});
