/**
 * PREVIEW HARNESS — not shipped. Stubs the API and renders one real page so a
 * change can be looked at before it is merged. Unreferenced by index.html, so
 * the production bundle never reaches it (verified: a prod build with these
 * pages present emits index.html only, and no string from this file appears in
 * the bundle). Run it at /preview060.html against the rally dev server.
 *
 * ── THE RULE, PAID FOR THE HARD WAY ─────────────────────────────────────────
 * SAMPLE DATA MUST VARY WITH THE OCCASION IT CLAIMS TO SHOW.
 *
 * A fixed sample across occasions has produced two false alarms, both reported
 * as product faults, both costing real time. An earlier version of this file
 * held one baby-shower task list and one baby-shower gifter letter constant
 * across all five occasions, so rendering ?occasion=bereavement produced "we
 * wanted to send you off" and "the next few months are going to be wonderful"
 * on a bereavement page. The product was occasion-aware the whole time.
 *
 * So: anything a real gift would word differently per occasion gets a
 * `Record<Occasion, …>`, never a literal. Copy per-occasion server data
 * verbatim from its source (occasionSuggestions.ts, inviteCopy.ts) rather than
 * inventing it. Throw on an unknown occasion rather than rendering a silently
 * wrong page. And render the PAGE component, not an inner component inside
 * hand-copied wrapper divs — that separately hid the header and footer and
 * produced a third false finding the same day.
 *
 * Before reporting anything that looks like bad copy from a render: grep the
 * repo for the string. If it is in here, it is not a bug.
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
import BuyDetails from "@/pages/BuyDetails";

const TIER_ID = new URLSearchParams(location.search).get("tier") ?? "workplace_individual";
// Read BEFORE the replaceState below, which clears location.search.
const PRESELECT = new URLSearchParams(location.search).get("occasion");

const TIERS = [
  { id: "consumer_personal", label: "Gift Aunt Lucy", blurb: "For someone you love.", amountCents: 5900, gifts: 1, sellable: true },
  { id: "workplace_individual", label: "One employee", blurb: "The most thoughtful parental leave send-off you can give.", amountCents: 7900, gifts: 1, sellable: true },
];

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/api/gift-tiers")) {
    return new Response(JSON.stringify(TIERS), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input as any, init);
}) as typeof window.fetch;

window.history.replaceState(null, "", `/buy/${TIER_ID}`);

/**
 * ?occasion=surgery — pre-select one of the occasion pills after mount, so a
 * screenshot of a CHOSEN occasion is reproducible from a URL alone.
 *
 * It finds the real pill by its label and dispatches a real click, rather than
 * seeding React state or faking the pressed styling. That matters: bug #062's
 * whole finding was that nothing must LOOK chosen until it IS chosen, and a
 * harness that painted the selected state itself could not tell you whether
 * the product still does. Anything this shows is the product's own doing.
 */
const PILL_LABELS: Record<string, string> = {
  new_baby: "New baby",
  illness_recovery: "Illness or recovery",
  surgery: "Surgery or a procedure",
  bereavement: "Loss",
  ongoing_support: "Ongoing support",
  other: "Something else",
};
if (PRESELECT) {
  const label = PILL_LABELS[PRESELECT];
  if (!label) throw new Error("preview060: unknown occasion " + PRESELECT);
  // POLL, and poll with a timer rather than rAF. Two separate traps here, both
  // already paid for elsewhere in this repo:
  //   • rAF is throttled to a standstill in a BACKGROUND tab, which is exactly
  //     where a headless screenshot run lives (the /terms#refund deep-link
  //     trap). A timer still fires there.
  //   • A single setTimeout(…, 0) loses the race: createRoot().render() only
  //     SCHEDULES the first render in React 18, so at 0ms the pills do not
  //     exist yet and a one-shot attempt silently finds nothing.
  // Polling removes the guess. It gives up loudly rather than leaving a
  // screenshot that quietly shows no occasion chosen and looks like a bug.
  const deadline = Date.now() + 5000;
  const tick = () => {
    const pill = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[aria-pressed]"),
    ).find((b) => b.textContent?.includes(label));
    if (pill) {
      pill.click();
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("preview060: no pill for " + label + " after 5s");
    }
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      {/* BuyDetails reads :tierId with wouter's useParams, which only resolves
          inside a matched <Route> — mounting the component bare returns {} and
          the page renders its "tier not available" dead end. */}
      <Router>
        <Switch>
          <Route path="/buy/:tierId" component={BuyDetails} />
        </Switch>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
