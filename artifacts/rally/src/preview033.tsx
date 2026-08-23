/**
 * PREVIEW HARNESS for bug #033 — not shipped. Stubs the API and renders the
 * REAL screens so the change can be looked at before it is merged.
 * Unreferenced by index.html, so the production bundle never reaches it.
 * Run at /preview033.html?screen=… against the rally dev server.
 *
 * ── THE RULES, BOTH PAID FOR THE HARD WAY ───────────────────────────────────
 *
 * 1. SAMPLE DATA MUST VARY WITH WHAT IT CLAIMS TO SHOW. A fixed sample has
 *    twice produced false bug reports. Here that means the LIFT sample and the
 *    PRESCRIPTION sample must be genuinely different rows — the whole point of
 *    #033's design is that one shows a wait answer and the other shows nothing,
 *    and a harness that hard-codes the same shape for both would prove nothing.
 *
 * 2. A RENDER SHOWS WHAT THE HARNESS SAID; ONLY THE SOURCE SHOWS WHAT THE
 *    PRODUCT SAYS. Every string below that a server would have produced is
 *    copied verbatim from its source (occasionSuggestions.ts). Before reporting
 *    anything here as bad copy: grep the repo. If it only exists in this file,
 *    it is the harness, not the product.
 *
 * The control labels ("Drop off only" etc.) are deliberately NOT copied here —
 * they are imported live from @/lib/liftWaitMode, so a reword at review shows
 * up in this render without anyone remembering to update the harness.
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
import { GiftActivation } from "@/components/GiftActivation";
import SupportPage from "@/pages/SupportPage";
import OrganiseAddSlots from "@/pages/OrganiseAddSlots";
import Manage from "@/pages/Manage";
import { AuthProvider } from "@/contexts/AuthContext";

const screen = new URLSearchParams(location.search).get("screen") ?? "activate";

// ── Sample rows ─────────────────────────────────────────────────────────────
// The lift and the prescription are deliberately DIFFERENT shapes: the lift is
// a dated errand carrying an answer, the prescription is an undated errand
// carrying none. That contrast is the thing being reviewed.

const LIFT_SLOT = {
  id: "slot-lift",
  pageId: "page-1",
  slotType: "errand",
  // Verbatim from occasionSuggestions.ts → illness_recovery → ir_lift.
  customLabel: "A lift to an appointment",
  slotDate: "2026-09-03",
  slotTime: "09:30",
  liftWaitMode: "wait",
  notes: null,
  dietaryNotes: null,
  headcount: null,
  isClaimed: false,
  claimedByName: null,
  claimedNote: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};

// The SAME task with no time yet — proves "Time to be confirmed" rather than a
// blank, which is the second half of the bug.
const LIFT_NO_TIME = {
  ...LIFT_SLOT,
  id: "slot-lift-tbc",
  customLabel: "A lift to the hospital",
  slotTime: null,
  liftWaitMode: "drop_off",
};

// The control case. A dated errand with NO answer: it must render exactly as it
// did before #033 existed — no pill, no clause, nothing. If a wait line appears
// on this tile, the fix has over-reached.
const PRESCRIPTION_SLOT = {
  ...LIFT_SLOT,
  id: "slot-script",
  // Verbatim from occasionSuggestions.ts → illness_recovery → ir_script.
  customLabel: "Pick up a prescription",
  slotDate: "2026-09-04",
  slotTime: null,
  liftWaitMode: null,
};

const MEAL_SLOT = {
  ...LIFT_SLOT,
  id: "slot-meal",
  slotType: "meal",
  // Verbatim from occasionSuggestions.ts → illness_recovery → ir_meal.
  customLabel: "A meal dropped over",
  slotDate: null,
  slotTime: null,
  liftWaitMode: null,
  headcount: 4,
  dietaryNotes: "No nuts",
};

const PAGE = {
  id: "page-1",
  slug: "sample",
  recipientName: "Priya",
  situationDescription: "recovering from surgery",
  location: "Marrickville",
  privacy: "public",
  status: "active",
  createdAt: "2026-08-23T00:00:00.000Z",
  slots: [LIFT_SLOT, LIFT_NO_TIME, PRESCRIPTION_SLOT, MEAL_SLOT],
};

// Suggestions, copied verbatim from occasionSuggestions.ts → illness_recovery.
// `dated` is carried honestly: the lift is the one dated suggestion, which is
// exactly what makes the wait control reachable on this screen.
const REVIEW = {
  recipientName: "Priya",
  occasion: "illness_recovery",
  activated: false,
  suggestions: [
    { key: "ir_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "ir_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "ir_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "ir_script", slotType: "errand", label: "Pick up a prescription", dated: false, trustedHelpersOnly: false },
    { key: "ir_visit", slotType: "visit", label: "A short visit", dated: false, trustedHelpersOnly: false },
  ],
};

// Shape copied from the REAL ManageState (openapi.yaml + routes/manage.ts):
// one flat `tasks` array, and recipientPronouns at the TOP level, not nested.
// An invented shape here first produced a crash that looked like a product bug
// (Manage reads data.recipientPronouns; undefined blew up resolvePronounTokens)
// — which is rule 2 at the top of this file, demonstrated live.
const MANAGE = {
  role: "recipient",
  recipientName: "Priya",
  slug: "sample",
  status: "active",
  occasion: "illness_recovery",
  recipientPronouns: "she_her",
  situationLine: null,
  situationLineDefault: "recovering from surgery",
  trustedLine: null,
  trustedLineDefault: "recovering from surgery",
  babyStage: null,
  recipientEmail: "priya@example.com",
  recipientMobile: null,
  bereavement: false,
  shareLink: "https://www.auntlucy.com.au/s/sample",
  cardKeepsakeUrl: null,
  recipientHasOwnAccess: true,
  tasks: [
    {
      id: "slot-lift", slotType: "errand", label: "A lift to an appointment",
      customLabel: "A lift to an appointment", notes: null, flexibility: "fixed",
      trustedHelpersOnly: false, isClaimed: false, claimedByName: null,
      claimedNote: null, claimedAt: null, slotDate: "2026-09-03",
      slotTime: "09:30", liftWaitMode: "wait", dietaryNotes: null, headcount: null,
    },
    {
      id: "slot-script", slotType: "errand", label: "Pick up a prescription",
      customLabel: "Pick up a prescription", notes: null, flexibility: "fixed",
      trustedHelpersOnly: false, isClaimed: false, claimedByName: null,
      claimedNote: null, claimedAt: null, slotDate: "2026-09-04",
      slotTime: null, liftWaitMode: null, dietaryNotes: null, headcount: null,
    },
    {
      id: "slot-lift-tbc", slotType: "errand", label: "A lift to the hospital",
      customLabel: "A lift to the hospital", notes: null, flexibility: "fixed",
      trustedHelpersOnly: false, isClaimed: true, claimedByName: "Dana",
      claimedNote: null, claimedAt: "2026-08-22T02:00:00.000Z",
      slotDate: "2026-09-10", slotTime: null, liftWaitMode: "drop_off",
      dietaryNotes: null, headcount: null,
    },
  ],
  contacts: [],
  invites: [],
  managers: [],
};

// ── Stubbed API ─────────────────────────────────────────────────────────────
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  if (url.includes("/api/gifts/") && url.includes("/review")) return json(REVIEW);
  if (url.includes("/api/pages/")) return json(PAGE);
  if (url.includes("/api/manage/")) return json(MANAGE);
  if (url.includes("/api/auth/me")) return json({ id: "org-1", email: "kate@example.com", name: "Kate" });
  // Any write (claim, add task, edit) succeeds without going anywhere.
  if (init?.method && init.method !== "GET") return json({ ok: true, id: "new-1" });
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

// OrganiseAddSlots reads its token from AuthContext, which reads localStorage.
localStorage.setItem("aunt_lucy_session", "preview-token");

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Screen() {
  if (screen === "activate") return <GiftActivation token="preview-gift-token" />;
  if (screen === "page")
    return (
      <Router base="">
        <Switch>
          <Route path="/s/:slug" component={SupportPage} />
        </Switch>
      </Router>
    );
  if (screen === "organise")
    return (
      <Router base="">
        <Switch>
          <Route path="/organise/create/:pageId/slots" component={OrganiseAddSlots} />
        </Switch>
      </Router>
    );
  if (screen === "manage")
    return (
      <Router base="">
        <Switch>
          <Route path="/manage/:token" component={Manage} />
        </Switch>
      </Router>
    );
  throw new Error(`Unknown screen "${screen}" — refusing to render a silently wrong page.`);
}

// wouter reads the real URL, so point it at the path each screen expects.
const PATHS: Record<string, string> = {
  page: "/s/sample",
  organise: "/organise/create/page-1/slots",
  manage: "/manage/preview-token",
};
if (PATHS[screen] && location.pathname !== PATHS[screen]) {
  history.replaceState(null, "", PATHS[screen] + location.search);
}

/**
 * HARNESS STAGING.
 *
 * Both of these screens legitimately open in a state where the thing under
 * review is not yet on screen — the activation list opens collapsed, and the
 * add-task form opens on "Meal". A screenshot of the default state would show
 * nothing of what is being reviewed.
 *
 * So this drives them THE WAY A PERSON WOULD: real clicks and real input
 * events on the real components, never a poke at internal state. What renders
 * afterwards is the component reacting, not the harness pretending.
 */
const waitFor = (find: () => HTMLElement | undefined, then: (el: HTMLElement) => void) => {
  let tries = 0;
  const tick = () => {
    const el = find();
    if (el) then(el);
    else if (tries++ < 40) setTimeout(tick, 100);
  };
  setTimeout(tick, 250);
};

const buttonMatching = (re: RegExp) => () =>
  [...document.querySelectorAll("button")].find(
    (b) => re.test(b.getAttribute("aria-label") ?? "") || re.test(b.textContent ?? ""),
  ) as HTMLElement | undefined;

if (screen === "activate") {
  // Open the lift, then give it a day — the date is what makes the time field
  // and the wait control reachable, exactly as it would be for a real person.
  waitFor(buttonMatching(/Change "A lift to an appointment"/), (btn) => {
    btn.click();
    waitFor(
      () => document.querySelector("input[type=date]") as HTMLElement | undefined,
      (input) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        setter.call(input, "2026-09-03");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
    );
  });
}

if (screen === "organise") {
  // The type buttons carry an emoji before their label, so match loosely.
  waitFor(buttonMatching(/Errand/), (btn) => btn.click());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Screen />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
