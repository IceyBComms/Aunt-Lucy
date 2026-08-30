/**
 * PREVIEW HARNESS — not shipped. Stubs the API and renders the REAL pages so
 * bug #041's footer can be looked at before it is merged. Unreferenced by
 * index.html, so the production bundle never reaches it. Run it at
 * /preview041.html against the rally dev server.
 *
 *   /preview041.html                        → the support page, bereavement
 *   /preview041.html?occasion=new_baby      → the support page, new baby
 *   /preview041.html?page=home              → the homepage (its own footer)
 *
 * ── THE RULE, INHERITED FROM preview060 ─────────────────────────────────────
 * SAMPLE DATA MUST VARY WITH THE OCCASION IT CLAIMS TO SHOW. A fixed sample
 * across occasions has already produced two false bug reports in this repo, so
 * every string a real page would word differently per occasion is a
 * `Record<Occasion, …>` here, never a literal. The task lists are copied
 * VERBATIM from `occasionSuggestions.ts` rather than invented, and an unknown
 * occasion throws rather than rendering a silently wrong page.
 *
 * This harness renders the PAGE components, not the footer on its own — the
 * whole point of #041 is how the footer sits at the bottom of a real page.
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
import SupportPage from "@/pages/SupportPage";
import Home from "@/pages/Home";

const params = new URLSearchParams(location.search);
const WHICH = params.get("page") ?? "support";
const OCCASION = params.get("occasion") ?? "bereavement";

type Sample = {
  recipientName: string;
  situationDescription: string;
  slots: { slotType: string; customLabel: string }[];
};

// Task lists copied verbatim from artifacts/api-server/src/lib/
// occasionSuggestions.ts. The situation lines are sample text, but they are
// per-occasion for the reason above — a bereavement page must never render a
// new-baby sentence, which is exactly what a shared literal would do.
const SAMPLES: Record<string, Sample> = {
  bereavement: {
    recipientName: "Bec",
    situationDescription:
      "Bec lost her mum last week. She's not up to much and doesn't want to have to ask.",
    slots: [
      { slotType: "meal", customLabel: "A meal, left at the door" },
      { slotType: "visit", customLabel: "Someone to sit with me" },
      {
        slotType: "other",
        customLabel: "The everyday things — bins, post, washing",
      },
      {
        slotType: "other",
        customLabel: "Answer the phone and the door for a bit",
      },
    ],
  },
  new_baby: {
    recipientName: "Priya",
    situationDescription:
      "Priya and Sam's baby arrived on Tuesday. Everyone's home and everyone's knackered.",
    slots: [
      { slotType: "meal", customLabel: "A meal for the freezer" },
      { slotType: "shopping", customLabel: "A grocery run" },
      { slotType: "visit", customLabel: "A visit, just for company" },
    ],
  },
};

const sample = SAMPLES[OCCASION];
if (WHICH === "support" && !sample) {
  throw new Error("preview041: no sample for occasion " + OCCASION);
}

const SLUG = "preview041";

const supportPageResponse = sample && {
  id: "page_preview041",
  slug: SLUG,
  recipientName: sample.recipientName,
  situationDescription: sample.situationDescription,
  location: "Brunswick, VIC",
  status: "active",
  privacy: "open",
  goodToKnow: null,
  helpingCount: 3,
  slots: sample.slots.map((s, i) => ({
    id: `slot_${i}`,
    pageId: "page_preview041",
    slotType: s.slotType,
    customLabel: s.customLabel,
    slotDate: null,
    slotTime: null,
    liftWaitMode: null,
    notes: null,
    dietaryNotes: null,
    headcount: null,
    isClaimed: i === 0,
    claimedByName: i === 0 ? "Jo" : null,
    claimedNote: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    calendarUrl: null,
  })),
};

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.includes(`/api/pages/${SLUG}`)) {
    return new Response(JSON.stringify(supportPageResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input as any, init);
}) as typeof window.fetch;

// SupportPage reads :slug via wouter's useRoute, which only resolves inside a
// matched <Route> — mounting the component bare gives it an empty slug and it
// renders the loading state forever.
window.history.replaceState(
  null,
  "",
  WHICH === "home" ? "/" : `/s/${SLUG}`,
);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <Router>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/s/:slug" component={SupportPage} />
        </Switch>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
