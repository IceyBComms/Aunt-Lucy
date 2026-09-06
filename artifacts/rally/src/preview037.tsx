/**
 * PREVIEW HARNESS — not shipped. Stubs the API and renders the REAL pages so
 * bug #037's calendar change can be looked at before it is merged.
 * Unreferenced by index.html, so the production bundle never reaches it.
 * Run it at /preview037.html against the rally dev server.
 *
 *   /preview037.html?page=release        → the release page (NO calendar link)
 *   /preview037.html?page=invite         → the trusted-invite post-claim screen
 *   /preview037.html?page=claim          → the public post-claim dialog
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * Bug #037: webcal:// never worked for anybody, so the only calendar link the
 * product now offers is a one-tap https .ics DOWNLOAD. The release page lost
 * its link entirely — a downloaded snapshot of a slot you have just handed back
 * would sit in the diary forever showing an appointment you are not committed
 * to. THE RELEASE RENDER IS THE ONE TO LOOK AT: the absence is the change, and
 * an absence can only be checked by eye.
 *
 * ── THE RULE, INHERITED FROM preview041/preview060 ──────────────────────────
 * SAMPLE DATA MUST VARY WITH WHAT IT CLAIMS TO SHOW, and an absence test needs
 * a positive control. The release sample is DATED and carries a calendarToken,
 * so it is exactly the case that used to render a calendar link — if the link
 * were still being emitted, this fixture would show it. A fixture with no date
 * would pass whether or not the fix worked, and would prove nothing.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/lora/index.css";
import "@fontsource-variable/lora/wght-italic.css";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/plus-jakarta-sans/wght-italic.css";
import "./index.css";
import { Route, Router, Switch } from "wouter";
import ReleaseSlot from "@/pages/ReleaseSlot";
import InviteClaim from "@/pages/InviteClaim";
import { ClaimDialog } from "@/components/ClaimDialog";

const params = new URLSearchParams(location.search);
const WHICH = params.get("page") ?? "release";

const CANCEL_TOKEN = "c".repeat(48);
const INVITE_TOKEN = "i".repeat(48);
// The https .ics — the one-tap download. NOT webcal://.
const CALENDAR_URL =
  "https://www.auntlucy.com.au/api/calendar/" +
  "d3f9a71c4b2e8056a1cc74be93f0d2ab5e7c118a6f40b9d2.ics";

// POSITIVE CONTROL: dated, timed, and flexible — the exact shape that rendered
// a calendar link before this fix. If the link came back, it would show here.
const releaseResponse = {
  slot: {
    id: "slot-abc-123",
    slotType: "meal",
    customLabel: null,
    slotDate: "2026-09-18",
    slotTime: "18:00",
    liftWaitMode: null,
    notes: null,
    flexibility: "flexible",
    claimedNote: null,
  },
  helperName: "Jane",
  page: {
    recipientName: "Sarah Chen",
    location: "Marrickville",
    slug: "sarah-chen-a1b2c3",
  },
};

const inviteDetails = {
  helperName: "Jane",
  alreadyClaimed: false,
  claimedByYou: false,
  slot: {
    id: "slot-abc-123",
    slotType: "meal",
    customLabel: null,
    slotDate: "2026-09-18",
    slotTime: "18:00",
    liftWaitMode: null,
    notes: null,
  },
  page: { recipientName: "Sarah Chen", location: "Marrickville" },
};

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  if (url.includes(`/api/slots/release/${CANCEL_TOKEN}`)) return json(releaseResponse);
  if (url.includes(`/api/invite/${INVITE_TOKEN}/claim`))
    // The post-claim payload: calendarUrl is the https download.
    return json({ ok: true, claimedByName: "Jane", cancelToken: CANCEL_TOKEN, calendarUrl: CALENDAR_URL });
  if (url.includes(`/api/invite/${INVITE_TOKEN}`)) return json(inviteDetails);
  return realFetch(input as any, init);
}) as typeof window.fetch;

// Both pages read their token via wouter's useParams, which only resolves
// inside a matched <Route> — mounting bare gives an empty token and an
// eternal loading state.
window.history.replaceState(
  null,
  "",
  WHICH === "invite" ? `/invite/${INVITE_TOKEN}` : `/release/${CANCEL_TOKEN}`,
);

// The public post-claim dialog is a component, not a route — it is normally
// opened by SupportPage. Mounted directly in its post-claim state, which is the
// only state bug #037 touches.
const claimedSlot = {
  ...releaseResponse.slot,
  pageId: "page-1",
  isClaimed: true,
  claimedByName: "Jane",
  claimedNote: null,
  dietaryNotes: null,
  headcount: null,
  createdAt: new Date().toISOString(),
  calendarUrl: CALENDAR_URL,
} as never;

function ClaimPreview() {
  return (
    <ClaimDialog
      slot={claimedSlot}
      recipientName="Sarah Chen"
      isOpen
      onClose={() => {}}
      onSubmit={async () => {}}
      isSubmitting={false}
      claimedResult={claimedSlot}
    />
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      {WHICH === "claim" ? (
        <ClaimPreview />
      ) : (
        <Router>
          <Switch>
            <Route path="/release/:token" component={ReleaseSlot} />
            <Route path="/invite/:token" component={InviteClaim} />
          </Switch>
        </Router>
      )}
    </QueryClientProvider>
  </StrictMode>,
);
