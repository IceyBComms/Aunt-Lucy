/**
 * Item 17 — "When plans change": all the on-screen microcopy for the family
 * task-management controls (/manage) and the helper claim-link controls
 * (/release). Kate's approved draft, reproduced verbatim.
 *
 * This is the single source of truth for the UI strings, so a review tweak is a
 * one-file change. The message BODIES Aunt Lucy actually SENDS (SMS/email) live
 * in the backend's own copy module (api-server/src/lib/item17Copy.ts) — the
 * frontend/backend package split is why the copy sits in exactly two files.
 *
 * Australian English throughout. 💛 is intentional.
 */

// ─── Family side (/manage) ───────────────────────────────────────────────────

export const family = {
  /** The per-task control that opens the edit form. */
  editLink: "Change this task",
  /** Shown above Save when editing a task a helper has already claimed. */
  editingClaimedNotice: (helper: string) =>
    `${helper} has this one — Aunt Lucy will let them know kindly. You don't have to explain.`,
  saveButton: "Update the task",
  saveButtonBusy: "Updating…",

  /** Confirm dialog — cancelling a task no one has claimed. */
  cancelUnclaimed: {
    title: "Take this off the list?",
    body: "No one's been asked yet — it'll quietly disappear.",
    keep: "Keep it",
    confirm: "Take it off",
  },

  /** Confirm dialog — cancelling a task a helper has claimed. */
  cancelClaimed: {
    title: (task: string) => `Cancel ${task}?`,
    body: (helper: string) =>
      `${helper} has this one. Aunt Lucy will thank them and let them know it's no longer needed — you don't have to explain a thing.`,
    keep: "Not yet",
    confirm: "Cancel the task",
  },

  /** Toast/confirmation after an edit or cancel. */
  done: "Done — Aunt Lucy's on it.",
} as const;

// ─── Helper side (/release — the claim link) ─────────────────────────────────

export const helper = {
  /**
   * Intro under the "Plans changed?" heading. Flexible copy is Kate's approved
   * verbatim line. The fixed line mirrors it without the "nudge the time" clause
   * (a fixed time isn't the helper's to move) — no verbatim fixed line was
   * supplied, so this is the obvious parallel; flagged in the PR for confirmation.
   */
  introFlexible: (recipientFirstName: string) =>
    `No problem. Nudge the time, leave a note or cancel if need be — Aunt Lucy will let ${recipientFirstName} know.`,
  introFixed: (recipientFirstName: string) =>
    `No problem. Leave a note or cancel if need be — Aunt Lucy will let ${recipientFirstName} know.`,

  /** Flexible tasks: reschedule the time of day (same day). */
  reschedule: {
    label: "Need a different time?",
    help: "Nudge it and Aunt Lucy will let them know.",
    notePlaceholder: "More like 6 — hope that's OK",
    button: "Update my time",
    buttonBusy: "Updating…",
  },

  /** Fixed tasks: leave a note (the time is not the helper's to move). */
  fixedNote: {
    lead: "Plans shifting? Leave a note and Aunt Lucy will pass it on.",
    /** Shown near the cancel control on a fixed task — the time is sensitive. */
    cancelBlurb: (task: string, recipientFirstName: string) =>
      `Plans changed and you can't do ${task}? This one's time sensitive so the sooner you cancel the better — Aunt Lucy will text ${recipientFirstName} straight away, so they've got time to make another plan.`,
    button: "Pass it on",
  },

  /** Shown if a helper tries to move a flexible task to a different day. */
  dateChangeGuardrail: (organiser: string) =>
    `Different day? That one's worth a quick word with ${organiser} — or cancel and the task goes back on the list.`,

  /** Give-up-the-task buttons. "Bow out" is retired from all helper-facing UI. */
  cancelButtonFixed: "Cancel — Aunt Lucy will text them now",
  cancelButtonFlexible: "Cancel — put it back on the list",
  cancelButtonBusy: "Cancelling…",

  /** The "n / 200" character counter under a note field. */
  noteCounter: (n: number) => `${n} / 200`,

  /** After a reschedule or a note. */
  confirmation: "Done — they'll know.",
  /** After cancelling a FIXED task — the recipient has been texted. */
  confirmationFixedCancel: (recipientFirstName: string) =>
    `Done — ${recipientFirstName} has the message. Thank you for the early word; it's what gives them time to sort another plan.`,
  /** After cancelling a FLEXIBLE task — the slot just goes back on the list. */
  confirmationFlexibleCancel: (recipientFirstName: string) =>
    `Thanks — Aunt Lucy will free up the slot for someone else and let ${recipientFirstName} know.`,

  /**
   * Reassurance beside the cancel control about what happens if they cancel.
   * Fixed is time-sensitive (a text goes straight away); flexible just reopens.
   */
  footerFixed: (recipientFirstName: string) =>
    `${recipientFirstName} will get a text straight away, so another plan can get moving.`,
  footerFlexible: (recipientFirstName: string) =>
    `No fuss — the slot goes back on the list and Aunt Lucy quietly lets ${recipientFirstName} know.`,

  errors: {
    noteTooLong: "That note's a little long — please shorten it.",
    badTime: "That time doesn't look right — please try again.",
    fallback: "Something went wrong — please try again.",
  },
} as const;
