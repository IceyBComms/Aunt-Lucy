/**
 * Copy for going live on the organiser and crisis path.
 *
 * Going live became a deliberate act on 14 Sep 2026 — step 3 used to publish
 * the moment it loaded, so this path had never had words for that moment. The
 * strings are held here, in one place, so a ruling changes one file.
 *
 * ✅ RULED BY KATE, 14 Sep 2026: every string in this file except `noTasks`.
 *    First ruling: step2Continue, step3Heading, step3Button, confirmTitle,
 *    confirmYes, confirmNo, confirmBody. Second ruling: step3Body,
 *    backToTasks, confirmYesBusy and
 *    publishFailed as written; notDraft CHANGED to "This page is already live."
 * ⏸️ NOT RULED: `noTasks` — see the note on it.
 *
 * `noTasks` and `notDraft` are mirrored by the server's refusals in
 * api-server/src/lib/pagePublish.ts — change both together.
 *
 * ✅ RULED BY KATE, 14 Sep 2026 (third ruling, bug #113 / PR #124):
 *    step3BodyWithInvitations and confirmBodyWithInvitations, with her two
 *    amendments — "invited" not "messaged", and "Everyone else sees the page
 *    when you share the link."
 *
 * Invitations are HELD until the page is published, and publishing sends them
 * straight away. So on a page with invitations waiting (the page's
 * `heldInviteCount` > 0) the WithInvitations lines replace step3Body and
 * confirmBody; on a page with none, the original lines are still true and
 * still shown.
 *
 * Deliberately NOT here, because each is its own row: the child care wording
 * and the generic invite message.
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
   * ✅ Ruled. Shown only when NO invitations are waiting — then pressing
   * "Make it live" sends nothing, and this is true as written.
   */
  step3Body:
    "Nothing's live yet. Have a last look at what's on the page — when you're happy, make it live.",
  /**
   * ✅ Kate's ruling, 14 Sep 2026 (#113). Shown INSTEAD of step3Body when the
   * page has invitations waiting. "Invited", not "messaged": the product does
   * send other messages from a draft (the crisis page-saved email among them),
   * so "no one's been messaged" would overreach.
   */
  step3BodyWithInvitations:
    "Nothing's live yet, and no one's been invited. Have a last look — when you make it live, Aunt Lucy will send the invitations you've added.",
  backToTasks: "Back to your tasks",

  // ✅ The confirm.
  confirmTitle: (recipientName: string) => `Make ${recipientName}'s page live?`,
  /**
   * ✅ Kate's ruling, 14 Sep: KEEP "Anyone with the link". Never soften it to
   * "anyone you share the link with" — a link CAN be forwarded, and on a crisis
   * page what gets forwarded is somebody's illness.
   *
   * ⚠️ THERE WAS A SECOND VARIANT AND IT IS GONE (21 Sep 2026, bug #129). It
   * read "… and your PIN …" and was shown when the page's `privacy` was
   * "pin_protected". The PIN itself has been dropped, so that sentence is no
   * longer true of any page, and a variant chosen by a flag nothing sets is a
   * trap for the next reader. The wording below is Kate's ruled `open` copy,
   * unchanged word for word — only the choosing is gone.
   *
   * Shown only when NO invitations are waiting. "Pressing this doesn't send
   * anyone a message" is true then and ONLY then — publishing sends a page's
   * held invitations straight away (#113), so a page with some gets
   * confirmBodyWithInvitations instead.
   */
  confirmBody:
    "Anyone with the link will be able to see the page and offer to help. Pressing this doesn't send anyone a message — you share the link when you're ready.",
  /**
   * ✅ Kate's ruling, 14 Sep 2026 (#113), for a page WITH invitations waiting.
   * Keeps "Anyone with the link" exactly as ruled above. "Everyone else sees
   * the page when you share the link" is her amendment — it replaced "everyone
   * else, you share the link with when you're ready", which is clumsy read
   * aloud. Its PIN variant went the same way as confirmBody's, for the same
   * reason; this is her ruled wording, untouched.
   */
  confirmBodyWithInvitations:
    "Anyone with the link will be able to see the page and offer to help. Making it live sends the invitations you've added. Everyone else sees the page when you share the link.",
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
