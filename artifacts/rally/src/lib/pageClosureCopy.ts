/**
 * Closing a page — the SCREEN microcopy (bug #090).
 *
 * ⏸️ NOT APPROVED. Every string here is a proposal for Kate, marked TODO(copy).
 * The SHAPE is ruled and is not a proposal.
 *
 * Split from api-server's lib/pageClosureCopy.ts for the same reason item17Copy
 * is split across two files: that one holds the words we SEND, this one holds
 * the words on the screen, and a literal single module would need a new shared
 * package for the sake of a handful of strings.
 *
 * The rules these have to keep, which are NOT negotiable in a copy pass:
 *   • NEITHER BUTTON IS RED. Red is a currency (Kate's rule). Closing a page is
 *     a considered, reversible act, not a destructive one.
 *   • BOTH HALVES OF THE TRUTH, together, every time reversibility is claimed.
 *     "You can undo this" on its own is not true: the page comes back, the
 *     commitments do not, and messages already sent cannot be unsent.
 *   • THE OPTIONAL BOX IS EMPTY AND ITS PLACEHOLDER SUGGESTS NOTHING. It says
 *     what the field is FOR, never what to write — prefilled or led text gets
 *     sent unread, and this box will be read by everyone who offered help.
 *
 * Australian English throughout.
 */
export const closure = {
  // ── The section on a running page ────────────────────────────────────────
  sectionTitle: "Closing this page",
  sectionBody:
    "When the help isn't needed any more, you can stop the page. Anyone who's " +
    "booked a task will be told it isn't going ahead, and nobody new can offer.",
  /** ONE closing action, not two. Not red. */
  openButton: "Close this page",

  // ── The confirm screen ───────────────────────────────────────────────────
  confirmTitle: "Close this page?",
  /** Above the list of people. The count is filled in by the caller. */
  confirmNobody: "Nobody has a task booked, so there's nobody to tell.",
  confirmSomeone: (n: number) =>
    n === 1
      ? "One person has a task booked. Closing the page cancels it:"
      : `${n} people have tasks booked. Closing the page cancels them:`,
  /** Beside anyone whose claim carries no contact point. */
  unreachable: "no contact on file — we can't message them",

  // Ruling 3 — the closer chooses who does the telling.
  tellingTitle: "Who lets them know?",
  tellOptionUs: "Let them know",
  tellOptionUsHint: "We'll message each person about the task they booked.",
  tellOptionMe: "I'll tell people myself",
  tellOptionMeHint:
    "Nothing is sent to them. Their tasks are still cancelled, so nobody is " +
    "left expecting to help.",

  // Ruling 4(b) — the optional box.
  noteLabel: "Anything you'd like to add? (optional)",
  /**
   * ⚠️ Says what the field is for and NOT what to write. A placeholder like
   * "Mum passed away on Friday" would be a template for the hardest sentence
   * someone ever types, and templates get accepted unread.
   */
  notePlaceholder: "Your own words, if you'd like to add some",
  noteHint:
    "Whatever you write is added to each message. The part saying which task " +
    "isn't going ahead is always included, so nobody is left guessing.",

  // Ruling 5 — both halves, on the screen, before the button.
  reversible:
    "You can reopen this page at any time. Reopening brings the page back — it " +
    "doesn't bring back the tasks people had booked, and messages already sent " +
    "can't be unsent.",

  confirmButton: "Close the page",
  cancelButton: "Not now",
  closing: "Closing…",

  // ── The closed page's own /manage screen ─────────────────────────────────
  closedTitle: "This page is closed",
  closedBody:
    "Nobody can see it or offer help. Everything on it is kept — reopening " +
    "brings the page back exactly as it was, minus the tasks people had booked.",
  /** Rendered only when we hold a date. */
  closedOn: (when: string) => `Closed on ${when}.`,
  reopenButton: "Reopen this page",
  reopening: "Reopening…",
  reopenWarning:
    "Tasks that were cancelled come back unclaimed — anyone who wants them can " +
    "offer again. Invitations that were cancelled aren't sent.",

  failed: "That didn't go through. Please try again.",
} as const;
