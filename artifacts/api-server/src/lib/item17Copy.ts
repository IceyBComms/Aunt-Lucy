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
 * (rally/src/lib/item17Copy.ts). The message bodies and the screen microcopy
 * are different jobs, so they stay in two files — but the TASK NAMES and DATE
 * FORMATS both of them use are now one shared package, @workspace/task-copy
 * (row #136).
 *
 * Australian English throughout. 💛 in warm microcopy is intentional.
 */
import { soonDay, type SoonDay } from "./australianDay";
import {
  formatTaskTime,
  taskNoun,
  taskShortNoun,
  taskWhenClause as sharedWhenClause,
  taskWhenSentence,
} from "@workspace/task-copy";

// ─── Names and dates now come from @workspace/task-copy ──────────────────────
//
// TWO task-name tables used to live in this file (TASK_NOUNS and TASK_NAMES)
// and six more lived elsewhere — row #136, and the reason four spellings of one
// task were live at once. They are gone; the names are in the shared package
// that rally imports too. These are the names this module's callers already
// use, kept as thin aliases so the copy below reads the way it always has.

/** A task's bare display name, no article: the recipient's wording, else a default. */
export const taskName = taskShortNoun;

/** How a task is named in a message, with its article: "the school run". */
export const taskLabel = taskNoun;

/**
 * "6:00pm" — lower-case, no space, and NO "around".
 *
 * ⚠️ Row #145 deliberately does NOT reach this one. Its only caller is the
 * recipient's message after a helper has MOVED a flexible task, which reads
 * "…will bring the meal closer to 6:00pm now" — "closer to" already says the
 * time can move, and "closer to around 6:00pm" is not a sentence. Every place
 * that states a task's own time goes through taskTimeLabel / taskWhen* instead.
 */
export const timeLabel = formatTaskTime;

/**
 * "Friday 8 August at 3:00pm", "Friday 8 August at around 3:00pm" when the time
 * can move (row #145), "Friday 8 August, any time that day" (row #143), or
 * "whenever suits" for an undated offer.
 */
export const whenLabel = taskWhenSentence;

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
export const whenClause = sharedWhenClause;

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
  /**
   * The SMS text, when it differs from the email body. Absent on every message
   * except the time-sensitive note, whose SMS drops the 💛 to stay GSM-7.
   */
  smsBody?: string;
}

/**
 * Kate's ruling, 16 Sep 2026 — for the time-sensitive note SMS ONLY (the note,
 * and the helper's name and task name, e.g. "O’Brien"): the
 * punctuation phones substitute as people type is folded back to GSM-7, so a
 * note typed "I’ll" doesn't by itself turn a 2-segment text into a 5-segment
 * one. Curly quotes and apostrophes → straight, en/em dashes → "-", "…" → "...".
 * Everything else stays as typed — an emoji the helper chose still forces
 * unicode, and that's accepted.
 */
export function normaliseNoteForSms(note: string): string {
  return note
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
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

/**
 * A FLEXIBLE task lost its helper: back on the list. Email (SMS if soon).
 *
 * Kate's ruling, 16 Sep 2026: "Nothing else needed from you." is dropped when
 * the task is TODAY — an open task on the day may well need something. Kept for
 * any other day.
 */
export function recipientFlexibleCancelled(params: {
  helperName: string;
  task: string;
  shareLink: string;
  isToday: boolean;
}): RecipientMessage {
  const tail = params.isToday ? "" : " Nothing else needed from you.";
  return {
    subject: "A small change on your page",
    body:
      `${params.helperName} can't manage ${params.task} after all. ` +
      `It's back on the list for your people: ${params.shareLink}.${tail}`,
  };
}

/**
 * A FLEXIBLE task was rescheduled by its helper. Email (SMS if soon).
 *
 * Kate's ruling, 16 Sep 2026: "— nothing needed from you" removed (a time can
 * move LATER on the day). The helper's note, when they left one, is now carried
 * — it used to be saved to the page and left out of this message entirely.
 * ⏸️ The "Their note:" line is flagged for Kate's confirmation.
 */
export function recipientFlexibleRescheduled(params: {
  helperName: string;
  task: string;
  newTime: string;
  note?: string | null;
}): RecipientMessage {
  const note = params.note?.trim();
  return {
    subject: "A small change on your page",
    body:
      `${params.helperName} will bring ${params.task} closer to ${params.newTime} now.` +
      (note ? `\n\nTheir note: "${note}"` : ""),
  };
}

/**
 * A helper left a note. One-way; visible only to the recipient + runner.
 *
 * Kate's ruling, 16 Sep 2026: a note can say "I'll be 25 min late", so the
 * product never tells the family "Nothing needed from you" about one.
 *
 *   • FIXED task, TODAY or TOMORROW (Australia/Sydney — lib/australianDay.ts):
 *     the approved time-sensitive wording. The EMAIL keeps "Aunt Lucy here 💛".
 *     The SMS (Kate's ruling, 16 Sep 2026) is "Aunt Lucy here:" with every fixed
 *     character plain GSM-7 — straight quotes, no dash, no emoji — and the note
 *     run through normaliseNoteForSms. Do not "tidy" its punctuation: one
 *     non-GSM-7 character makes the whole text unicode (3 segments, not 2, for
 *     a 40-character note).
 *   • Every other note: the ordinary line, without "Nothing needed from you".
 *
 * `soon` is null for anything that isn't a fixed task on one of those two days.
 * helperNoteNotice below decides it, so the rule lives in one place.
 */
export function recipientNotePassedOn(params: {
  helperName: string;
  /** "the school run" — taskLabel(). */
  task: string;
  /** "school run" — taskName(), for the subject. */
  taskName: string;
  note: string;
  soon: SoonDay | null;
}): RecipientMessage {
  if (params.soon) {
    return {
      subject: `A note about ${params.soon}'s ${params.taskName}`,
      body:
        `Aunt Lucy here 💛 ${params.helperName} left a note about ${params.task} ${params.soon}: ` +
        `"${params.note}". They're still doing it. If the timing matters, you may want a backup plan.`,
      smsBody:
        `Aunt Lucy here: ${normaliseNoteForSms(params.helperName)} left a note about ${normaliseNoteForSms(params.task)} ${params.soon}: ` +
        `"${normaliseNoteForSms(params.note)}". They're still doing it. If the timing matters, you may want a backup plan.`,
    };
  }
  return {
    subject: "A small note on your page",
    body:
      `${params.helperName} left a note on ${params.task}: "${params.note}"\n\n` +
      `Just keeping you in the loop.`,
  };
}

/**
 * Everything the note route needs to tell the family, decided in one pure
 * place: the channel rule's inputs and the words. `now` is passed so the
 * midnight edge is testable.
 */
export function helperNoteNotice(params: {
  slot: {
    slotType: string;
    customLabel: string | null;
    slotDate: string | null;
    flexibility: "fixed" | "flexible";
    claimedByName: string | null;
  };
  note: string;
  now: Date;
}): { flexibility: "fixed" | "flexible"; slotDate: string | null; message: RecipientMessage } {
  const { slot } = params;
  const soon = slot.flexibility === "fixed" ? soonDay(slot.slotDate, params.now) : null;
  return {
    flexibility: slot.flexibility,
    slotDate: slot.slotDate,
    message: recipientNotePassedOn({
      helperName: slot.claimedByName ?? "Someone",
      task: taskLabel(slot.slotType, slot.customLabel),
      taskName: taskName(slot.slotType, slot.customLabel),
      note: params.note,
      soon,
    }),
  };
}
