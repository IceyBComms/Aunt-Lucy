/**
 * Copy for going live on the organiser and crisis path.
 *
 * Going live became a deliberate act on 14 Sep 2026 — step 3 used to publish
 * the moment it loaded, so this path had never had words for that moment. The
 * strings are held here, in one place, so a ruling changes one file.
 *
 * ✅ RULED BY KATE, 14 Sep 2026: step2Continue, step3Heading, step3Button,
 *    confirmTitle, confirmYes, confirmNo, and confirmBody (both variants — the
 *    PIN variant was her addition).
 * ⏸️ STILL PROPOSED, NOT RULED: step3Body, backToTasks, confirmYesBusy,
 *    noTasks, notDraft, publishFailed.
 *
 * `noTasks` and `notDraft` are mirrored by the server's refusals in
 * api-server/src/lib/pagePublish.ts — change both together.
 *
 * Deliberately NOT here, because each is its own row: the child care wording,
 * the generic invite message, and whether invitations send from a draft page.
 */
export const SETUP_PUBLISH_COPY = {
  // ✅ Step 2's button. It said "Continue — publish page →", which stopped
  //    being true when step 3 stopped publishing on load.
  step2Continue: "Continue — one last look →",

  // ✅ Step 3 heading and button. "Ready when you are." is Kate's activation
  //    phrase on the gift path, so both ways into a live page share one moment.
  step3Heading: "Ready when you are.",
  step3Button: "Make it live",
  // ⏸️ Proposed.
  step3Body:
    "Nothing's live yet. Have a last look at what's on the page — when you're happy, make it live.",
  backToTasks: "Back to your tasks",

  // ✅ The confirm.
  confirmTitle: (recipientName: string) => `Make ${recipientName}'s page live?`,
  /**
   * ✅ Kate's ruling, 14 Sep: KEEP "Anyone with the link". Never soften it to
   * "anyone you share the link with" — a link CAN be forwarded, and on a crisis
   * page what gets forwarded is somebody's illness. The PIN gap is closed by a
   * second variant, not by hedging the first.
   *
   * Chosen by the page's `privacy`: "pin_protected" is exactly the condition
   * under which the public page demands a PIN (routes/pages.ts), and a page
   * can only be created pin_protected with a PIN (routes/organiser.ts).
   *
   * Both describe what pressing the button does TODAY. Neither says "nothing
   * has been sent": a trusted helper's invitation goes out when the task is
   * SAVED, on a draft — the next row's question.
   */
  confirmBody: {
    open: "Anyone with the link will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
    pinProtected:
      "Anyone with the link and your PIN will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
  },
  confirmYes: "Make it live",
  confirmNo: "Not yet",
  // ⏸️ Proposed.
  confirmYesBusy: "Making it live…",

  // ⏸️ Proposed — supporting strings the rulings above imply.
  noTasks: "Add at least one task before the page goes live.",
  notDraft: "This page isn't a draft any more, so there's nothing to make live.",
  publishFailed: "That didn't work, and nothing has gone live. Please try again.",
} as const;
