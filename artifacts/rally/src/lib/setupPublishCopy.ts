/**
 * Copy for going live on the organiser and crisis path.
 *
 * Going live became a deliberate act on 14 Sep 2026 — step 3 used to publish
 * the moment it loaded, so this path had never had words for that moment. The
 * strings are held here, in one place, so a ruling changes one file.
 *
 * ✅ RULED BY KATE, 14 Sep 2026: every string in this file except `noTasks`.
 *    First ruling: step2Continue, step3Heading, step3Button, confirmTitle,
 *    confirmYes, confirmNo, confirmBody (both variants — the PIN variant was
 *    her addition). Second ruling: step3Body, backToTasks, confirmYesBusy and
 *    publishFailed as written; notDraft CHANGED to "This page is already live."
 * ⏸️ NOT RULED: `noTasks` — see the note on it.
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
  /**
   * ✅ Ruled.
   *
   * ⚠️ WHEN INVITATIONS ARE HELD UNTIL PUBLISH (the next prompt after PR #122),
   * THIS LINE MUST ALSO SAY THAT MAKING THE PAGE LIVE SENDS THEM. Today a
   * trusted helper's invitation goes out when the task is SAVED, on a draft,
   * so pressing "Make it live" sends nothing and this line is true as written.
   * The moment sending moves to publish, "have a last look… make it live"
   * describes a button that now messages people without saying so.
   */
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
   *
   * ⚠️ Same trigger as step3Body: when invitations are held until publish,
   * "Pressing this doesn't send anyone a message" becomes FALSE in both
   * variants and must change with it.
   */
  confirmBody: {
    open: "Anyone with the link will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
    pinProtected:
      "Anyone with the link and your PIN will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
  },
  confirmYes: "Make it live",
  confirmNo: "Not yet",
  // ✅ Ruled.
  confirmYesBusy: "Making it live…",

  /**
   * ⏸️ NOT RULED. Kate, 14 Sep, optional and not holding the merge: this MAY
   * become "Your page needs at least one task before it can go live."
   * If it does, change the server's `no_tasks` message in pagePublish.ts too.
   */
  noTasks: "Add at least one task before the page goes live.",
  /**
   * ✅ Kate's ruling, 14 Sep — replaced "This page isn't a draft any more, so
   * there's nothing to make live.", which explained internal state in internal
   * vocabulary (nobody thinks of their page as a draft) with a double negative.
   * Where the page's link is on screen, it is shown beneath (OrganisePublish).
   *
   * ⚠️ "ALREADY LIVE" IS CORRECT ONLY BECAUSE NOTHING IN THE CODE EVER WRITES
   * `closed`. This refusal fires for ANY page that is not a draft — the server's
   * `not_draft` in pagePublish.ts, and OrganisePublish's non-draft screen. Today
   * the only non-draft status anything sets is `active`, so it is true. WHEN
   * PAGE CLOSURE SHIPS (#090), A CLOSED PAGE REACHES THIS SAME REFUSAL AND THIS
   * WORDING BECOMES WRONG — split the refusal by status at that point.
   */
  notDraft: "This page is already live.",
  // ✅ Ruled.
  publishFailed: "That didn't work, and nothing has gone live. Please try again.",
} as const;
