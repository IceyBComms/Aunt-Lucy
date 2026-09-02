/**
 * The feedback block on /manage — every on-screen string, in one file.
 *
 * ⚠️ KATE'S APPROVED WORDS, REPRODUCED VERBATIM. DO NOT REWORD ANY OF THIS
 * WITHOUT HER. The register is the point: this box will be opened by someone
 * whose person has just died.
 *
 *   • First person and signed, both in the ask and in the thank-you. A person
 *     asking is answerable; a brand asking is a survey (the #095 lesson).
 *   • Nothing cheery. No "We'd love your feedback!", no exclamation marks, no
 *     emoji anywhere in these strings.
 *   • No star rating, no 1–5, no NPS. At a handful of pages a 4-out-of-5 tells
 *     Kate nothing and a sentence tells her everything. Ratings are for when
 *     you have too much feedback to read.
 *   • Never "would you recommend Aunt Lucy" — that is asking a grieving person
 *     to do marketing.
 *
 * THREE THINGS THAT MUST NOT APPEAR IN THE THANK-YOU, each a real fault:
 *   • No promise of a reply. "I'll get back to you" is a promise the product
 *     cannot keep, and breaking it after someone wrote something painful is
 *     worse than never asking. "I read every one of these myself" is warm,
 *     TRUE, and promises nothing.
 *   • No call to action of any kind — no share, no "tell a friend", and above
 *     all no extension offer. That contamination is why this was built alone.
 *   • No performed emotion. No "we're so sorry", no heart, no emoji. They
 *     wrote; it was received; that is the whole exchange.
 */

export const feedback = {
  /** The ask. Deliberately the block's opening — there is no section heading. */
  intro:
    "If you've got a minute, I'd like to know how this actually went. It helps me make it better for the next person.",
  signature: "— Kate",

  /** The outcome question — asks what HAPPENED, so it produces a story. */
  labelWentWell: "Did people show up? Tell us how it went.",
  /** The bug question — where problems surface in a user's own words. */
  labelGotInTheWay: "Anything get in the way?",

  submit: "Send",
  submitBusy: "Sending…",

  /** Replaces the form, immediately, and stays there. Never a toast. */
  thanks: "Thank you. I read every one of these myself.",
  /** The quiet way back in — people think of things afterwards. */
  addMore: "Add something else",

  /**
   * Shown only if the request itself failed. The submission is refused before
   * anything is written, so nothing has been lost — say that plainly.
   */
  failed: "That didn't send. Nothing was lost — try again in a moment.",
} as const;
