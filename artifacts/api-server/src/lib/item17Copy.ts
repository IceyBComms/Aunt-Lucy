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
 * Bug #013 — the claim confirmation, as an SMS.
 *
 * A helper who claims with a phone number used to get nothing at all: the
 * confirmation was email-only and returned silently on a non-email contact, so
 * the release link (which exists nowhere else for a public claim) never reached
 * them. This is that message.
 *
 * Kate's approved wording, verbatim. Written GSM-7 safe ON PURPOSE — a straight
 * apostrophe, no em dash, no curly quotes — because one non-GSM-7 character
 * drops the per-segment capacity from 153 characters to 67 and would turn this
 * into five segments. Do not "tidy" the punctuation.
 *
 * It is expected to bill as TWO segments: the release link alone is 84
 * characters. That is a deliberate trade — this is the one message whose job is
 * making someone feel good about volunteering. sendSms is passed a label so PR
 * #59's segment warning names this template in the logs.
 *
 * Only the release link is carried. The calendar subscription lives on the page
 * that link opens, so the message stays to one URL.
 */
export function helperClaimConfirmed(params: {
  helperFirstName: string;
  recipientFirstName: string;
  task: string;
  /** Already-built "on Friday 8 August at 3:00pm" or "whenever suits". */
  whenClause: string;
  releaseLink: string;
  /**
   * Bug #033 — the lift wait-or-not clause, already GSM-safe, or null.
   *
   * ⚠️ NULL IS THE COMMON CASE and must add NOTHING to the message: not a
   * space, not a full stop. A phone-only helper is the one who most needs this
   * (they get no email and no calendar link), and also the one whose message
   * costs money per segment, so it is one short sentence and only ever present
   * on an answered lift.
   */
  liftClause?: string | null;
}): string {
  const lift = params.liftClause ? `${params.liftClause} ` : "";
  return (
    `Thanks ${params.helperFirstName}, you're helping ${params.recipientFirstName} ` +
    `with ${params.task} ${params.whenClause}. ${lift}` +
    `Change or cancel any time: ${params.releaseLink}`
  );
}

/**
 * The "{when}" half of the line above. A dated task reads "on Friday 8 August";
 * an undated one is already a phrase ("whenever suits") and takes no "on", or
 * the sentence would read "on whenever suits".
 */
export function whenClause(slotDate: string | null, slotTime: string | null): string {
  const when = whenLabel(slotDate, slotTime);
  return slotDate ? `on ${when}` : when;
}

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
  // Three blocks: statement, reassurance, link. The link is LAST and alone on
  // its paragraph, which is what lets the email promote it to a button with
  // nothing stranded after it. The previous shape put the link mid-sentence, so
  // promoting it left "— one tap, no drama." orphaned below the button.
  return (
    `Hi ${params.helperFirstName}, small change on ${params.recipientFirstName}'s page: ` +
    `${params.task} is now ${params.newDetail}.

` +
    `If that still works, there's nothing you need to do. If it doesn't, one tap sorts it — no drama.

` +
    `${params.releaseLink}`
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
    `Hi ${params.helperFirstName} — plans have changed and ${params.task} for ${params.recipientFirstName} ` +
    `isn't needed after all — there's nothing more for you to do. Thank you for putting your hand up; it counted. ` +
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
    `Hi ${params.helperFirstName} — a small update: plans have changed and ${params.task} for ${params.recipientFirstName} ` +
    `isn't needed after all. Thank you for being there for them. ` +
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
