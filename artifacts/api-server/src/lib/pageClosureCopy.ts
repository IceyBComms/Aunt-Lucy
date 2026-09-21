/**
 * The words closure sends (bug #090).
 *
 * ⏸️ COPY NOT APPROVED. Every string in this file is a proposal for Kate and is
 * marked TODO(copy) at its own function. The SHAPE is ruled and is not a
 * proposal: what may be edited here is the wording, never the two-part split.
 *
 * ── RULING 4: THE MESSAGE IS TWO PARTS, AND THE SPLIT IS THE POINT ───────────
 *
 *   (a) A FIXED FACT, WRITTEN BY US, ALWAYS SENT, NOT EDITABLE AND NOT
 *       OPTIONAL: the specific task this helper committed to is no longer
 *       going ahead. No sentiment, and it NEVER says why.
 *       ⚠️ THIS IS THE SAFETY FLOOR. If a family writes only "thank you all so
 *       much" and nobody registers that the school run is off, a child is left
 *       at school. `helperClosureMessage` therefore takes the optional note as
 *       an argument and appends it — there is no code path in which the note
 *       is sent without the fact, because there is no function that renders
 *       the note alone.
 *
 *   (b) AN OPTIONAL FREE-TEXT BOX the closer may add, EMPTY BY DEFAULT and
 *       never prefilled — prefilled text gets sent unread.
 *
 * ── ATTRIBUTED TO THE CLOSER, NEVER TO AUNT LUCY ─────────────────────────────
 * "Fergus has closed Tammy's page." Never "Aunt Lucy is letting you know…".
 * Aunt Lucy is not the one making a statement about somebody's situation. When
 * we do not know the closer's name — the crisis and organiser setup paths
 * capture a contact and often no name — the sentence goes passive rather than
 * describing them by their role, the same choice accessGrants.ts makes for its
 * no-name openers.
 *
 * ── TWO ENDINGS ──────────────────────────────────────────────────────────────
 * Every line below has to work for "we're fine now, thank you" AND for "she
 * died". Administrative phrasing — "no longer required" — is fine for the first
 * and awful for the second, so the register splits on occasion exactly as the
 * shipped task-cancellation copy already does (item17Copy.ts:
 * helperTaskCancelledStandard / helperTaskCancelledBereavement).
 *
 * ── NO PAGE LINK, DELIBERATELY ───────────────────────────────────────────────
 * The task-cancellation messages end with "if you'd like to see what else would
 * help: {pageLink}". Closure must not: the page it would point at is closed and
 * answers 404. A link that is dead on arrival reads as a broken message on top
 * of a sad one.
 */
import { firstName } from "./names";
import { taskLabel, whenClause } from "./item17Copy";
import type { SlotFlexibility } from "@workspace/task-copy";

/** Is this page's register the gentler one? The same test the shipped copy uses. */
export function isBereavement(occasion: string | null | undefined): boolean {
  return occasion === "bereavement";
}

/**
 * Who closed it, in one word — or null for the passive form.
 *
 * A recipient's own grant carries no `personName` (the page is already theirs),
 * so the name comes from the page instead. A manager or setup-person grant
 * carries their own. Null on the paths where nothing ever captured a name.
 */
export function closerFirstName(
  grant: { role: string; personName: string | null },
  recipientName: string,
): string | null {
  if (grant.personName?.trim()) return firstName(grant.personName);
  return grant.role === "recipient" ? firstName(recipientName) : null;
}

/** "Fergus has closed Tammy's Aunt Lucy page" / "Tammy's … page has been closed". */
function closedClause(closerFirst: string | null, recipientFirst: string): string {
  return closerFirst
    ? `${closerFirst} has closed ${recipientFirst}'s Aunt Lucy page`
    : `${recipientFirst}'s Aunt Lucy page has been closed`;
}

export interface HelperClosureParams {
  helperName: string | null;
  recipientName: string;
  /** From closerFirstName above; null takes the passive opener. */
  closerFirst: string | null;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  /** Row #145 — the closure message names the task's time in the same words. */
  flexibility: SlotFlexibility;
  occasion: string | null;
  /** The optional box. Empty, whitespace or null all mean "nothing was added". */
  note: string | null;
}

/**
 * ⏸️ TODO(copy) — the fixed fact, plus the optional note when there is one.
 *
 * The task and its when-clause are built with the SAME helpers the rest of the
 * product uses (taskLabel / whenClause from item17Copy), so a helper reads the
 * task named the way their claim confirmation named it — the recipient's own
 * wording where they wrote some, "whenever suits" for an undated offer.
 *
 * "isn't going ahead" rather than "isn't needed after all": the second is the
 * shipped wording for a single cancelled task and is right there, but a page
 * that closed because somebody died should not tell twelve people their help
 * was not needed. "Going ahead" states what happened to the task and makes no
 * claim about the family.
 */
export function helperClosureMessage(params: HelperClosureParams): string {
  const helperFirst = firstName(params.helperName ?? "there");
  const recipientFirst = firstName(params.recipientName);
  const task = taskLabel(params.slotType, params.customLabel);
  const when = whenClause(params.slotDate, params.slotTime, params.flexibility);
  const opening = closedClause(params.closerFirst, recipientFirst);

  // (a) THE FIXED FACT. Always present, in both registers, and it names THIS
  //     helper's task and its time. It never says why the page closed.
  const fact = isBereavement(params.occasion)
    ? `Hi ${helperFirst} — ${opening}. That means ${task} ${when} isn't going ahead. ` +
      `Thank you for being there for them.`
    : `Hi ${helperFirst} — ${opening}, so ${task} ${when} isn't going ahead. ` +
      `Thank you for putting your hand up; it counted.`;

  // (b) THE OPTIONAL BOX, clearly theirs and clearly separate. Kept to ONE
  //     place in the message (and one column in the database) so a later
  //     retention job can destroy it without hunting for copies.
  const note = params.note?.trim();
  if (!note) return fact;
  const from = params.closerFirst ? `From ${params.closerFirst}:` : "They've added:";
  return `${fact}\n\n${from}\n"${note}"`;
}

/**
 * ⏸️ TODO(copy) — the helper email's subject line.
 *
 * Says that something closed and nothing about why. Deliberately not the
 * shipped "A small update on X's page": this is not small, and a subject that
 * undersells it is read later or not at all — the safety floor again.
 */
export function helperClosureSubject(recipientName: string): string {
  return `${firstName(recipientName)}'s page has closed`;
}

/**
 * ⏸️ TODO(copy) — what the OTHER grant-holders are told.
 *
 * They are told either way, which means this line has to carry the one thing
 * that actually differs: WHETHER THE HELPERS HAVE HEARD. A sister who assumes
 * everybody was messaged, when her brother chose to ring them himself, will not
 * ring anyone. That sentence is the whole reason this message exists, and it is
 * the grant-holders' equivalent of the helpers' fixed fact.
 *
 * TWO REGISTERS, on the same test the helper copy uses. The standard one is
 * brisk and administrative, which is right for "we're fine now, thank you". The
 * bereavement one drops the task-by-task framing — a co-manager on a page about
 * someone who has died does not need "they aren't going ahead" itemised at
 * them — and drops the cheerful "at any time" from the reopen line, because
 * offering to restart a dead woman's meal roster in the same breath as telling
 * her sister it has stopped reads appallingly. It still SAYS it can be
 * reopened: ruling 5 is not negotiable by register.
 */
export function grantHolderClosureMessage(params: {
  recipientName: string;
  closerFirst: string | null;
  helpersTold: number;
  /** False when the closer chose "I'll tell people myself". */
  tellHelpers: boolean;
  /** The page's occasion, so a bereavement page takes the quieter wording. */
  occasion?: string | null;
}): { subject: string; body: string } {
  const recipientFirst = firstName(params.recipientName);
  const opening = closedClause(params.closerFirst, recipientFirst);
  const who = params.closerFirst ?? "They";
  const gentle = isBereavement(params.occasion);

  // The load-bearing sentence, in both registers.
  const tail = !params.tellHelpers
    ? // ⚠️ Identical in both registers ON PURPOSE. This is the one thing the
      // reader must act on, and softening it is how somebody ends up assuming
      // the calls were made.
      `${who === "They" ? "They're" : `${who} is`} letting the people who'd offered help know ` +
      `themselves, so nothing has been sent to them from here.`
    : params.helpersTold === 0
      ? `Nobody had a task booked, so there was nobody to tell.`
      : params.helpersTold === 1
        ? gentle
          ? `The one person who had a task booked has been let know.`
          : `The one person who had a task booked has been told it isn't going ahead.`
        : gentle
          ? `The ${params.helpersTold} people who had tasks booked have been let know.`
          : `The ${params.helpersTold} people who had tasks booked have been told they aren't going ahead.`;

  const reopen = gentle
    ? `There's nothing else you need to do. If it's ever wanted again, your own link will reopen it.`
    : `It can be reopened at any time from your own link.`;

  return {
    subject: `${recipientFirst}'s page has closed`,
    body: `${opening}. ${tail}\n\n${reopen}`,
  };
}

/**
 * The PUBLIC page's message, and the only one of these that is already
 * approved — it has been in routes/pages.ts since the first build.
 *
 * 🛑 RULING 6, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE: THE PUBLIC PAGE
 * MUST NEVER SAY WHY. Not "Tammy has died". Not "Tammy no longer needs help".
 * Someone arriving late is told it is over and nothing more — no occasion, no
 * recipient name, no circumstances. Anything added to this string is read by
 * anyone who has the link, including people the family never invited.
 *
 * Duplicated as a literal in rally's use-rally.ts, which tells the three 404
 * reasons apart by matching on it. lib/pageClosureDrift.test.ts fails if the
 * two copies stop agreeing.
 */
export const CLOSED_PAGE_MESSAGE = "This support page has been closed.";

/**
 * ⏸️ TODO(copy) — what an INVITE link to a closed page says.
 *
 * Its own string because an invite is not the public page: the person holding
 * it was asked personally, and being told "this invitation link is invalid or
 * has expired" reads as our mistake or theirs. It must read as CLOSED, never as
 * broken. It says no more about why than the public page does, and it does not
 * name the recipient — the token alone is not proof of who is holding it.
 */
export const CLOSED_INVITE_MESSAGE = "This page has been closed.";
