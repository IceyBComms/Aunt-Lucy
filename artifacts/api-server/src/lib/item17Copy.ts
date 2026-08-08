/**
 * Item 17 — "When plans change": all the message copy Aunt Lucy SENDS when a
 * booked task is edited, cancelled, rescheduled, or picks up a helper note.
 *
 * This is the single source of truth for those message BODIES (Kate's approved
 * draft, reproduced verbatim). Review tweaks happen here, in one file. The
 * branded email chrome lives in email.ts and the channel-selection / send
 * orchestration lives in item17Notify.ts — neither reword anything here.
 *
 * The FAMILY-SIDE and HELPER-SIDE *screen* microcopy (buttons, confirm dialogs,
 * error text) is UI, so it lives in the frontend's own single copy module
 * (rally/src/lib/item17Copy.ts). The frontend/backend package boundary is why
 * the copy is split across exactly two files rather than one — a literal single
 * module would need a new shared package for the sake of a handful of strings.
 *
 * Australian English throughout. 💛 in warm microcopy is intentional.
 */

// Short, mid-sentence noun phrases for a task with no custom label. The
// recipient's own wording (customLabel) is always preferred when present — it's
// what they wrote and what shows on the live page.
const TASK_NOUNS: Record<string, string> = {
  meal: "a meal",
  school_pickup: "the school pickup",
  child_care: "looking after the kids",
  errand: "an errand",
  dog_walking: "walking the dog",
  shopping: "the shopping",
  visit: "a visit",
  other: "the task",
};

/** How a task is named in a message: the recipient's wording, else a default. */
export function taskLabel(slotType: string, customLabel: string | null): string {
  const label = customLabel?.trim();
  return label || TASK_NOUNS[slotType] || "the task";
}

/** "6:00pm" — lower-case, matching the invite SMS style. */
export function timeLabel(timeStr: string): string {
  const [h, min] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

/**
 * "Friday 8 August", "Friday 8 August at 3:00pm", or "whenever suits" for an
 * undated (flexible) offer. Pinned to Australia/Sydney so a late-evening UTC
 * server date never prints as the previous day for the reader. A time is only
 * ever paired with a real date — an undated task has no clock.
 */
export function whenLabel(slotDate: string | null, slotTime: string | null): string {
  if (!slotDate) return "whenever suits";
  const date = new Date(slotDate + "T00:00:00");
  const dateStr = date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  });
  return slotTime ? `${dateStr} at ${timeLabel(slotTime)}` : dateStr;
}

// ─── Messages to the HELPER (their invite channel) ───────────────────────────

/**
 * The family edited a task the helper has claimed. The claim STANDS; this is a
 * heads-up with a one-tap "can't any more" out (the release link).
 */
export function helperTaskChanged(params: {
  helperFirstName: string;
  recipientFirstName: string;
  task: string;
  newDetail: string;
  releaseLink: string;
}): string {
  return (
    `Hi ${params.helperFirstName}, small change on ${params.recipientFirstName}'s page: ` +
    `${params.task} is now ${params.newDetail}. If that still works, no need to do a thing. ` +
    `If it doesn't: ${params.releaseLink} — one tap, no drama.`
  );
}

/**
 * The family cancelled a task the helper had claimed. Standard (celebratory /
 * neutral) register. "Off the hook" never appears — helping is not a debt.
 */
export function helperTaskCancelledStandard(params: {
  helperFirstName: string;
  recipientFirstName: string;
  task: string;
  pageLink: string;
}): string {
  return (
    `Hi ${params.helperFirstName} — ${params.task} for ${params.recipientFirstName} is covered now, ` +
    `and there's nothing more needed from you. Thank you for putting your hand up; it counted. ` +
    `If you'd like to see what else would help: ${params.pageLink}`
  );
}

/** The bereavement / crisis variant of the cancellation — gentler register. */
export function helperTaskCancelledBereavement(params: {
  helperFirstName: string;
  recipientFirstName: string;
  task: string;
  pageLink: string;
}): string {
  return (
    `Hi ${params.helperFirstName} — a small update: ${params.task} for ${params.recipientFirstName} ` +
    `is taken care of now. Thank you for being there for them. ` +
    `The page is here if you'd like to see what else would help: ${params.pageLink}`
  );
}

/** Subject line for a helper task-update EMAIL (SMS has no subject). */
export function helperEmailSubject(recipientFirstName: string): string {
  return `A small update on ${recipientFirstName}'s page`;
}

// ─── Messages to the RECIPIENT (+ runner if different) ───────────────────────
//
// Each returns { subject, body }. The body is the verbatim copy and is used
// as-is for SMS; for email it's wrapped in the branded layout under `subject`.
// Any {link} is embedded in the body exactly as approved; the email renderer
// makes that URL tappable without changing a word.

export interface RecipientMessage {
  subject: string;
  body: string;
}

/**
 * A FIXED task lost its helper (helper released it, or the family reopened it):
 * it's back on the list. Fixed → this always goes by SMS (see item17Notify).
 */
export function recipientFixedLostHelper(params: {
  helperName: string;
  task: string;
  when: string;
  shareLink: string;
}): RecipientMessage {
  return {
    subject: "A change on your page",
    body:
      `Aunt Lucy here 💛 ${params.helperName} can't do ${params.task} (${params.when}) after all. ` +
      `It's back on the list — your people can see it here: ${params.shareLink}. ` +
      `If it's for today, a quick nudge to someone will sort it.`,
  };
}

/** A FLEXIBLE task lost its helper: back on the list. Email (SMS if soon). */
export function recipientFlexibleCancelled(params: {
  helperName: string;
  task: string;
  shareLink: string;
}): RecipientMessage {
  return {
    subject: "A small change on your page",
    body:
      `${params.helperName} can't manage ${params.task} after all. ` +
      `It's back on the list for your people: ${params.shareLink}. Nothing else needed from you.`,
  };
}

/** A FLEXIBLE task was rescheduled by its helper. Email (SMS if soon). */
export function recipientFlexibleRescheduled(params: {
  helperName: string;
  task: string;
  newTime: string;
}): RecipientMessage {
  return {
    subject: "A small change on your page",
    body: `${params.helperName} will bring ${params.task} closer to ${params.newTime} now — nothing needed from you.`,
  };
}

/** A helper left a note. One-way; visible only to the recipient + runner. */
export function recipientNotePassedOn(params: {
  helperName: string;
  task: string;
  note: string;
}): RecipientMessage {
  return {
    subject: "A small note on your page",
    body:
      `${params.helperName} left a note on ${params.task}: "${params.note}"\n\n` +
      `Nothing needed from you — just keeping you in the loop.`,
  };
}
