/**
 * The Aunt Lucy helper-invite copy (approved — content §9/§9e).
 *
 * The message BODIES here (9a–9d, the 9c email and the trusted invite email)
 * are the approved templates and are reproduced verbatim — Aunt Lucy signs and
 * the recipient's name leads, and every message carries an opt-out line — the
 * SMS bodies inline, the email bodies as a final line that email.ts lifts into
 * the branded footer for the HTML part. Do not reword any of them here.
 *
 * The occasion phrases below (`{situationLine}` for the standard invites,
 * `{trustedLine}` for the trusted "support circle" invite) may contain the
 * pronoun tokens {poss} (her/his/their) and {obj} (her/him/them); they are
 * resolved against the recipient's pronouns at send time via
 * `applyPronounTokens`. The recipient can edit the standard line before sending.
 */
import type { Occasion } from "./occasion";

export type RecipientPronouns = "she_her" | "he_him" | "they_them";

/**
 * For a new_baby page: whether the baby's arrived yet. Null means "not asked",
 * and the copy falls back to a stage-agnostic default. Only new_baby reads this;
 * every other occasion ignores it. Mirrors the babyStage enum in the DB schema.
 */
export type BabyStage = "expecting" | "arrived";

/** Subject, object and possessive pronouns for the copy tokens. */
export function resolvePronouns(
  p: RecipientPronouns,
): { cap: string; obj: string; poss: string } {
  switch (p) {
    case "she_her":
      return { cap: "She", obj: "her", poss: "her" };
    case "he_him":
      return { cap: "He", obj: "him", poss: "his" };
    // Default and safest: never assumes a gender.
    case "they_them":
    default:
      return { cap: "They", obj: "them", poss: "their" };
  }
}

/** Replace {poss}/{obj} tokens in an occasion line. Plain text passes through. */
export function applyPronounTokens(line: string, p: RecipientPronouns): string {
  const { obj, poss } = resolvePronouns(p);
  return line.replace(/\{poss\}/g, poss).replace(/\{obj\}/g, obj);
}

/**
 * Approved occasion defaults (content §9e). Standard line drops into
 * "<Name>'s <situationLine>" (9a) and "<Name>'s <situationLine>, and…" (9c).
 * Trusted line drops into "<Name>'s <trustedLine>, and thought you might…" (9b).
 * Deliberately vague, never clinical — see the privacy rules in CLAUDE.md.
 *
 * The new_baby entries here are the STAGE-AGNOSTIC defaults, used when baby_stage
 * is null (unanswered). Baby showers are gifted well before the birth, so the
 * default can't assume the baby has arrived; the stage-specific wordings live in
 * the NEW_BABY_*_BY_STAGE maps below and are selected in the resolver functions.
 */
export const SITUATION_LINE_DEFAULTS: Record<Occasion, string> = {
  new_baby: "welcoming a new baby into the family",
  illness_recovery: "not been well lately",
  // Bug #058. NOT a variant of the illness line — the opposite of it. Someone
  // having a knee done in three weeks is perfectly well, so "not been well
  // lately" is untrue, and it is the line thirty of their friends read.
  // "a medical procedure" rather than "surgery" is deliberate and is Kate's
  // wording: it covers a day procedure through to something serious, so she
  // is never forced to disclose how bad it is to thirty people.
  surgery: "got a medical procedure coming up",
  bereavement: "recently lost someone dear to {obj}",
  ongoing_support: "carrying a lot at the moment",
  other: "got a lot on right now",
};

export const TRUSTED_LINE_DEFAULTS: Record<Occasion, string> = {
  new_baby: "getting ready for the new baby",
  // Doesn't assume the procedure/event has already happened — "planned surgery"
  // is gifted ahead of the event just as recovery is gifted after it.
  illness_recovery: "getting some extra support with their health at the moment",
  // Bug #058. Deliberately spans both sides of the date — it assumes neither
  // that the procedure has happened nor that it hasn't, the same care the
  // illness trusted line above was already written with.
  surgery: "getting a bit of help around a procedure and the weeks after",
  bereavement: "going through a difficult time after a recent loss",
  ongoing_support: "could use a little extra support right now",
  other: "got a lot on right now",
};

/**
 * new_baby standard-line wordings by stage. 'arrived' keeps the original default
 * ("just welcomed {poss} new baby"); 'expecting' reads true pre-birth. baby_stage
 * null uses the agnostic default in SITUATION_LINE_DEFAULTS above instead.
 */
const NEW_BABY_SITUATION_BY_STAGE: Record<BabyStage, string> = {
  expecting: "getting ready to welcome a new baby",
  arrived: "just welcomed {poss} new baby",
};

/**
 * new_baby trusted-line wordings by stage. 'arrived' keeps the original default;
 * 'expecting' deliberately reuses the agnostic pre-birth wording (it already
 * reads right for that stage), so no separate 'expecting' variant is needed.
 */
const NEW_BABY_TRUSTED_BY_STAGE: Record<BabyStage, string> = {
  expecting: "getting ready for the new baby",
  arrived: "finding {poss} feet with the new baby",
};

export function defaultSituationLine(
  occasion: Occasion | null,
  babyStage: BabyStage | null = null,
): string {
  if (occasion === "new_baby" && babyStage) {
    return NEW_BABY_SITUATION_BY_STAGE[babyStage];
  }
  return SITUATION_LINE_DEFAULTS[occasion ?? "other"];
}

export function defaultTrustedLine(
  occasion: Occasion | null,
  babyStage: BabyStage | null = null,
): string {
  if (occasion === "new_baby" && babyStage) {
    return NEW_BABY_TRUSTED_BY_STAGE[babyStage];
  }
  return TRUSTED_LINE_DEFAULTS[occasion ?? "other"];
}

/** Prepend the recipient's optional personal opener, leaving the body intact. */
function withOpener(body: string, openingLine: string | null): string {
  const opener = (openingLine ?? "").trim();
  return opener ? `${opener}\n\n${body}` : body;
}

// ─── SMS bodies (verbatim templates) ─────────────────────────────────────────

/** 9a — general "anyone can help" invite. situationLine is pre-resolved. */
export function generalInviteSms(params: {
  helperFirstName: string;
  recipientFirstName: string;
  situationLine: string;
  link: string;
  openingLine?: string | null;
}): string {
  const body =
    `Hi ${params.helperFirstName} 💛 ${params.recipientFirstName}'s ${params.situationLine} ` +
    `and we've set up a page where friends can lend a hand — a meal, a visit, or helping in another way. ` +
    `There's absolutely no pressure. Have a peek whenever: ${params.link} — Aunt Lucy x\n` +
    `(reply STOP anytime and I'll leave you be)`;
  return withOpener(body, params.openingLine ?? null);
}

/**
 * 9b — trusted "support circle" invite. The specific task is shown on the
 * invite page, not named in the SMS. trustedLine is pre-resolved.
 */
export function trustedInviteSms(params: {
  helperFirstName: string;
  recipientFirstName: string;
  trustedLine: string;
  pronounPoss: string;
  link: string;
  openingLine?: string | null;
}): string {
  const body =
    `Hi ${params.helperFirstName} 💛 ${params.recipientFirstName}'s ${params.trustedLine}, ` +
    `and thought you might like to be part of ${params.pronounPoss} support circle ` +
    `— only if it suits, no pressure at all. Have a look: ${params.link} — Aunt Lucy x\n` +
    `(reply STOP anytime and I'll leave you be)`;
  return withOpener(body, params.openingLine ?? null);
}

/** 9d — gentle second wave, only when tasks are still open. */
export function secondWaveSms(params: {
  helperFirstName: string;
  recipientFirstName: string;
  link: string;
  openingLine?: string | null;
}): string {
  const body =
    `Hi ${params.helperFirstName} 💛 just a gentle one — a couple of things on ${params.recipientFirstName}'s page ` +
    `are still open if you'd ever like to help. No pressure, as always. ${params.link} — Aunt Lucy x\n` +
    `(reply STOP anytime)`;
  return withOpener(body, params.openingLine ?? null);
}

// ─── Email (9c) ──────────────────────────────────────────────────────────────

export function generalInviteEmailSubject(recipientFirstName: string): string {
  return `A little way to help ${recipientFirstName} 💛`;
}

/** 9c — general invite email body, plain text. situationLine is pre-resolved. */
export function generalInviteEmailText(params: {
  helperFirstName: string;
  recipientFirstName: string;
  situationLine: string;
  pronounObj: string;
  link: string;
  unsubscribeUrl: string;
  openingLine?: string | null;
}): string {
  const body = [
    `Hi ${params.helperFirstName},`,
    ``,
    `${params.recipientFirstName}'s ${params.situationLine}, and a few of the people who love ${params.pronounObj} ` +
      `have set up an Aunt Lucy page so friends can lend a hand without ${params.pronounObj} needing to ask.`,
    ``,
    `It might be a meal, a visit, a few groceries or something else that suits. There's no pressure at all — ` +
      `just have a look whenever you're ready.`,
    ``,
    `See how you can help → ${params.link}`,
    ``,
    `With love,`,
    `Aunt Lucy x`,
    ``,
    `Don't want to receive these emails? Unsubscribe here: ${params.unsubscribeUrl}`,
  ].join("\n");
  return withOpener(body, params.openingLine ?? null);
}

// ─── Trusted invite email (9b's email counterpart) ───────────────────────────
//
// Approved by Kate, August 2026. Until now the trusted ask existed only as an
// SMS (9b above), so an email contact hand-picked for a specific task had their
// invite quietly downgraded to the general 9c page invite — slot dropped, no
// grant, nobody told (bug #032). This body is what removes the reason for that
// downgrade, so the kind of an invite can follow the task it was written for
// and the channel can go back to being only about how the message travels.
//
// Unlike 9b, this one NAMES the task and its timing. That is deliberate and it
// is the difference the channel allows: an SMS is read over someone's shoulder
// on a lock screen, an inbox is not, and the whole point of a trusted ask is
// that it was meant for one person in particular.
//
// {organiserFirstName} is NOT available on any build site that calls this — the
// organisers table stores an email and nothing else, the management-token path
// knows the page but never the person typing, and page.organiser_id is null on
// every gifted page. The approved fallback wording ("and you came to mind…") is
// therefore the only second line, not a branch. Same gap that shaped PR #58.

/** The CTA words, shared by the text line below and the HTML button. */
export const TRUSTED_INVITE_EMAIL_CTA = "Have a look";

export function trustedInviteEmailSubject(recipientFirstName: string): string {
  return `${recipientFirstName} was hoping you might help with something`;
}

/**
 * The trusted invite email body, plain text. trustedLine is pre-resolved (its
 * {poss}/{obj} tokens already applied); taskLabel and when are pre-formatted by
 * the caller from the slot — see taskLabel()/whenLabel() in item17Copy.
 *
 * The CTA line follows the same shape as 9c ("<label> → <link>"): email.ts
 * lifts that line out of the text and renders it as the branded button, so the
 * label here and the button label are the same words by construction.
 */
export function trustedInviteEmailText(params: {
  helperFirstName: string;
  recipientFirstName: string;
  trustedLine: string;
  taskLabel: string;
  when: string;
  /**
   * Bug #033 — the lift wait-or-not line, or null. Null renders NOTHING: no
   * blank line, no empty brackets.
   *
   * This is the only invite copy that names a specific task, which is why it is
   * the only one that needs this. The SMS variants deliberately don't name the
   * task at all (they link to the invite page, which shows it), so there is
   * nothing there for this to qualify.
   */
  liftNote?: string | null;
  link: string;
  /**
   * Spelled out inline as 9c's final line, verbatim. The branded HTML footer
   * renders its own link from the same address and email.ts strips this line
   * out of the HTML body, so the two never double up — but a plain-text reader
   * still gets a way out. Required, so no caller can quietly omit it.
   */
  unsubscribeUrl: string;
  openingLine?: string | null;
}): string {
  const body = [
    `Hi ${params.helperFirstName},`,
    ``,
    `${params.recipientFirstName}'s ${params.trustedLine}, and you came to mind for something in particular:`,
    ``,
    `${params.taskLabel} — ${params.when}`,
    ...(params.liftNote ? [params.liftNote] : []),
    ``,
    `This one's only being asked of a few people, which is why this note is just for you.`,
    ``,
    `Only if it suits — no pressure at all, and nothing happens if you'd rather not.`,
    ``,
    `${TRUSTED_INVITE_EMAIL_CTA} → ${params.link}`,
    ``,
    `— Aunt Lucy`,
    ``,
    `Don't want to receive these emails? Unsubscribe here: ${params.unsubscribeUrl}`,
  ].join("\n");
  return withOpener(body, params.openingLine ?? null);
}
