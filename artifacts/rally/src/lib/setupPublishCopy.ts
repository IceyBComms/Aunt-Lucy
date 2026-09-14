/**
 * ⏸️ PROPOSED COPY — NOT RULED. Nothing in this file is Kate's approved wording.
 *
 * Going live on the organiser and crisis path became a deliberate act on
 * 14 Sep 2026 — step 3 used to publish the moment it loaded, so this path has
 * never had words for the moment of going live. COPY_BANK.md is the copy of
 * record, so every new string is held here, in one place, as a proposal. When
 * Kate rules, change the values here and nothing else.
 *
 * `noTasks` and `notDraft` are mirrored by the server's refusals in
 * api-server/src/lib/pagePublish.ts — change both together.
 *
 * Deliberately NOT here, because each is its own row: the child care wording,
 * the generic invite message, and whether invitations send from a draft page.
 */
export const SETUP_PUBLISH_COPY = {
  // (c) Step 2's button. It said "Continue — publish page →", which stopped
  //     being true when step 3 stopped publishing on load.
  step2Continue: "Continue — one last look →",

  // (a) Step 3, before anything is live. "Ready when you are." is Kate's
  //     activation phrase on the gift path (COPY_BANK: locked brand language);
  //     proposed here so both ways into a live page share one moment.
  step3Heading: "Ready when you are.",
  step3Body:
    "Nothing's live yet. Have a last look at what's on the page — when you're happy, make it live.",
  step3Button: "Make it live",
  backToTasks: "Back to your tasks",

  // (a) + (b) The confirm. It says what pressing it does TODAY and nothing
  //     more: the page opens at its link, and pressing it sends nobody a
  //     message. It deliberately does NOT say "nothing has been sent" — on this
  //     path a trusted helper's invitation goes out when the task is SAVED, on
  //     a draft, which is the next row's question and not settled here.
  confirmTitle: (recipientName: string) => `Make ${recipientName}'s page live?`,
  confirmBody:
    "Anyone with the link will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
  confirmYes: "Make it live",
  confirmYesBusy: "Making it live…",
  confirmNo: "Not yet",

  // Supporting strings the rulings above imply.
  noTasks: "Add at least one task before the page goes live.",
  notDraft: "This page isn't a draft any more, so there's nothing to make live.",
  publishFailed: "That didn't work, and nothing has gone live. Please try again.",
} as const;
