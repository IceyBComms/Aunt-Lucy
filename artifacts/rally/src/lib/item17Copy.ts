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
      `${helper} has this one. Aunt Lucy will thank them and let them know it's covered — you don't have to explain a thing.`,
    keep: "Not yet",
    confirm: "Cancel the task",
  },

  /** Toast/confirmation after an edit or cancel. */
  done: "Done — Aunt Lucy's on it.",
} as const;

// ─── Helper side (/release — the claim link) ─────────────────────────────────

export const helper = {
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
    body:
      "Plans shifting? Leave a note and Aunt Lucy will pass it on. If the time no longer works, you can bow out below — no drama, it just goes back on the list.",
    button: "Pass it on",
  },

  /** Shown if a helper tries to move a flexible task to a different day. */
  dateChangeGuardrail: (organiser: string) =>
    `Different day? That one's worth a quick word with ${organiser} — or bow out and the task goes back on the list.`,

  /** The "n / 200" character counter under a note field. */
  noteCounter: (n: number) => `${n} / 200`,

  confirmation: "Done — they'll know.",

  errors: {
    noteTooLong: "That note's a little long — please shorten it.",
    badTime: "That time doesn't look right — please try again.",
    fallback: "Something went wrong — please try again.",
  },
} as const;
