/**
 * PREVIEW HARNESS — not shipped. Stubs the API and renders one real page so a
 * change can be looked at before it is merged. Unreferenced by index.html, so
 * the production bundle never reaches it (verified: a prod build with these
 * pages present emits index.html only, and no string from this file appears in
 * the bundle). Run it at /preview035.html against the rally dev server.
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
import GiftExperience from "@/pages/GiftExperience";

const TOKEN = "previewtoken";

// ?occasion=bereavement etc. — lets one harness prove what every occasion renders.
const OCCASION = new URLSearchParams(location.search).get("occasion") ?? "new_baby";
const NO_LINE = new URLSearchParams(location.search).get("noline") === "1";
const REVIEW_FAIL_PARAM = new URLSearchParams(location.search).get("reviewfails");
const REVIEW_FAILS = REVIEW_FAIL_PARAM !== null && REVIEW_FAIL_PARAM !== "0";
const REVIEW_FAIL_STATUS = REVIEW_FAIL_PARAM === "404" ? 404 : 500;
const KNOWN = ["new_baby", "illness_recovery", "surgery", "bereavement", "ongoing_support", "other"];
if (!KNOWN.includes(OCCASION)) {
  throw new Error("preview035: no sample data for occasion " + OCCASION);
}

// Mirrors SITUATION_LINE_DEFAULTS / TRUSTED_LINE_DEFAULTS in
// api-server/src/lib/inviteCopy.ts — the server sends these on the review payload.
const SITUATION: Record<string, string> = {
  new_baby: "welcoming a new baby into the family",
  illness_recovery: "not been well lately",
  surgery: "got a medical procedure coming up",
  bereavement: "recently lost someone dear to {obj}",
  ongoing_support: "carrying a lot at the moment",
  other: "got a lot on right now",
};
const TRUSTED: Record<string, string> = {
  new_baby: "getting ready for the new baby",
  illness_recovery: "getting some extra support with their health at the moment",
  surgery: "getting a bit of help around a procedure and the weeks after",
  bereavement: "going through a difficult time after a recent loss",
  ongoing_support: "could use a little extra support right now",
  other: "got a lot on right now",
};

// Copied verbatim from api-server/src/lib/occasionSuggestions.ts so the harness
// shows the tasks the product actually serves per occasion, not a fixed list.
const SUGGESTIONS: Record<string, any[]> = {
  new_baby: [
    { key: "nb_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "nb_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "nb_hold", slotType: "other", label: "Hold the baby so I can shower", dated: false, trustedHelpersOnly: false },
    { key: "nb_wash", slotType: "other", label: "A load of washing", dated: false, trustedHelpersOnly: false },
    { key: "nb_pickup", slotType: "school_pickup", label: "School pickup for the big kids", dated: false, trustedHelpersOnly: true },
    { key: "nb_visit", slotType: "visit", label: "A short visit, no fuss", dated: false, trustedHelpersOnly: false },
  ],
  illness_recovery: [
    { key: "ir_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "ir_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "ir_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "ir_dog", slotType: "dog_walking", label: "Walk the dog", dated: false, trustedHelpersOnly: false },
    { key: "ir_script", slotType: "errand", label: "Pick up a prescription", dated: false, trustedHelpersOnly: false },
    { key: "ir_visit", slotType: "visit", label: "A short visit", dated: false, trustedHelpersOnly: false },
  ],
  surgery: [
    { key: "sg_meal", slotType: "meal", label: "A meal, left at the door", dated: false, trustedHelpersOnly: false },
    { key: "sg_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "sg_shop", slotType: "shopping", label: "A hand with the groceries", dated: false, trustedHelpersOnly: false },
    { key: "sg_visit", slotType: "visit", label: "A short visit, once I'm up to it", dated: false, trustedHelpersOnly: false },
  ],
  bereavement: [
    { key: "bv_meal", slotType: "meal", label: "A meal, left at the door", dated: false, trustedHelpersOnly: false },
    { key: "bv_sit", slotType: "visit", label: "Someone to sit with me", dated: false, trustedHelpersOnly: false },
    { key: "bv_everyday", slotType: "other", label: "The everyday things — bins, post, washing", dated: false, trustedHelpersOnly: false },
    { key: "bv_door", slotType: "other", label: "Answer the phone and the door for a bit", dated: false, trustedHelpersOnly: false },
  ],
  ongoing_support: [
    { key: "os_meal", slotType: "meal", label: "A meal for the week", dated: false, trustedHelpersOnly: false },
    { key: "os_shop", slotType: "shopping", label: "A regular grocery run", dated: false, trustedHelpersOnly: false },
    { key: "os_shift", slotType: "child_care", label: "Take a shift so I can get out", dated: false, trustedHelpersOnly: true },
    { key: "os_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "os_visit", slotType: "visit", label: "A visit, just for company", dated: false, trustedHelpersOnly: false },
  ],
  other: [
    { key: "ot_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "ot_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "ot_errand", slotType: "errand", label: "An errand or a lift", dated: false, trustedHelpersOnly: false },
    { key: "ot_visit", slotType: "visit", label: "A visit", dated: false, trustedHelpersOnly: false },
  ],
};

/**
 * SAMPLE DATA MUST VARY WITH THE OCCASION IT CLAIMS TO SHOW.
 *
 * An earlier version of this harness held one baby-shower letter and one set of
 * baby-shower colleague notes constant across all five occasions. Rendering
 * ?occasion=bereavement then produced "we wanted to send you off" and "the next
 * few months are going to be wonderful" on a bereavement page, which looked
 * exactly like a product fault and was reported as one. Twice, counting the
 * task list. If you add a field here that a real gift would word differently
 * per occasion, give it an entry for every occasion or leave it null.
 *
 * The letter is buyer-typed free text (gifted_by_note) with no product default,
 * so null is the honest representation of the common case.
 */
const LETTERS: Record<string, string | null> = {
  new_baby:
    "Zara, we wanted to send you off with something more useful than flowers.\n\nThe next few months are going to be wonderful and completely relentless, often in the same hour. This is a little bit of help, already sorted, for whenever you want it.\n\nWith love from all of us.",
  illness_recovery:
    "Zara, we're all thinking of you.\n\nDon't give work a second thought, it will keep. This is a bit of practical help, already organised, for whenever you want to use it.\n\nFrom all of us.",
  surgery:
    "Zara, good luck with it all next week.\n\nWe've sorted a bit of practical help for when you're home, so you don't have to think about the shopping or the lifts. It's there if you want it.\n\nFrom all of us.",
  bereavement:
    "Zara, we are so sorry.\n\nThere's nothing we can say that helps, so we've done the only useful thing we could think of instead. Use it, or don't, it's here either way.\n\nWith love from all of us.",
  ongoing_support:
    "Zara, we know you've been carrying a lot.\n\nThis is a small, practical hand, already set up, no admin for you. Lean on it whenever you want to.\n\nFrom all of us.",
  other: null,
};

const NOTES: Record<string, { signerName: string; message: string }[]> = {
  new_baby: [
    { signerName: "Priya", message: "Cannot wait to meet the little one. Call me for anything, day or night." },
    { signerName: "Tom", message: "Put me down for a lasagne. It is the only thing I can cook but I cook it well." },
    { signerName: "The Finance team", message: "Enjoy every second. We'll keep your desk plant alive, promise." },
  ],
  illness_recovery: [
    { signerName: "Priya", message: "Rest properly. I'm on standby for lifts to appointments, any day." },
    { signerName: "Tom", message: "Put me down for a lasagne. It is the only thing I can cook but I cook it well." },
    { signerName: "The Finance team", message: "Take the time you need. Nothing here is on fire." },
  ],
  surgery: [
    { signerName: "Priya", message: "Good luck next week. I'm around all of the following one for lifts." },
    { signerName: "Tom", message: "Put me down for a lasagne. It is the only thing I can cook but I cook it well." },
    { signerName: "The Finance team", message: "Good luck with it all. Work's here when you're ready, not before." },
  ],
  bereavement: [
    { signerName: "Priya", message: "I'm so sorry. I'll be around, and I won't expect anything back." },
    { signerName: "Tom", message: "No words. Just here, and happy to sit with you or leave food at the door." },
    { signerName: "The Finance team", message: "Thinking of you and your family. Take all the time you need." },
  ],
  ongoing_support: [
    { signerName: "Priya", message: "You've been carrying this a long while. Let us take a couple of things." },
    { signerName: "Tom", message: "Put me down for a lasagne. It is the only thing I can cook but I cook it well." },
    { signerName: "The Finance team", message: "We're not going anywhere. Ask us for the boring stuff." },
  ],
  other: [
    { signerName: "Priya", message: "Whatever's going on, I'm around. Just say the word." },
    { signerName: "Tom", message: "Put me down for a lasagne. It is the only thing I can cook but I cook it well." },
  ],
};

const GIFT = {
  recipientName: "Zara",
  organisationMessage: LETTERS[OCCASION],
  giftedBy: "The team at Meridian",
  occasion: OCCASION,
  isTeamCard: true,
  signings: NOTES[OCCASION],
};

const REVIEW = {
  activated: false,
  canActivate: true,
  recipientName: "Zara",
  giftedBy: "The team at Meridian",
  occasion: OCCASION,
  slug: null,
  status: null,
  scheduledActivateAt: null,
  // ?noline=1 — simulate the server sending NO occasion default at all, which is
  // what the two nullable fields allow. Bug #059: the placeholder must then be
  // empty, never a guess. Reproducible from a URL so it can be re-checked.
  situationLine: NO_LINE ? null : SITUATION[OCCASION],
  trustedLine: NO_LINE ? null : TRUSTED[OCCASION],
  recipientEmail: "zara@example.com",
  manageToken: null,
  suggestions: SUGGESTIONS[OCCASION],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // ?reviewfails=1 — the keepsake call succeeds and the REVIEW call fails. Two
  // different endpoints back this screen, and only the first is guarded by the
  // parent page, so this combination is the one worth being able to look at.
  if (url.endsWith(`/api/gifts/${TOKEN}/review`)) {
    // Counted so the RETRY POLICY can be observed. The stub replaces
    // window.fetch, so no real request leaves the page and devtools/CDP see
    // nothing — this counter is the only way to check that a 500 is actually
    // retried rather than merely configured to be.
    (window as unknown as { __reviewCalls?: number }).__reviewCalls =
      ((window as unknown as { __reviewCalls?: number }).__reviewCalls ?? 0) + 1;
    // reviewfails=1 → 500 (transient, retried). reviewfails=404 → a settled
    // 4xx, which must NOT be retried: repeating a genuinely bad link just
    // delays the honest dead-end.
    if (REVIEW_FAILS) return new Response("{}", { status: REVIEW_FAIL_STATUS });
    return json(REVIEW);
  }
  if (url.endsWith(`/api/gifts/${TOKEN}`)) return json(GIFT);
  return realFetch(input as any, init);
}) as typeof window.fetch;

// GiftExperience reads the token from the browser location via wouter, so put
// the real route in the address bar before mounting.
window.history.replaceState(null, "", `/gift/${TOKEN}`);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <GiftExperience />
    </QueryClientProvider>
  </StrictMode>,
);
