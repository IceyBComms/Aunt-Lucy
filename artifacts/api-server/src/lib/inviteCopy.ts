/**
 * The Aunt Lucy helper-invite copy (approved — content §9/§9e).
 *
 * The message BODIES here (9a–9d and the 9c email) are the approved templates
 * and are reproduced verbatim — Aunt Lucy signs, the recipient's name leads,
 * and every message carries an opt-out line. Do not reword them here.
 *
 * The occasion phrases below (`{situationLine}` for the standard invites,
 * `{trustedLine}` for the trusted "support circle" invite) may contain the
 * pronoun tokens {poss} (her/his/their) and {obj} (her/him/them); they are
 * resolved against the recipient's pronouns at send time via
 * `applyPronounTokens`. The recipient can edit the standard line before sending.
 */
import type { Occasion } from "./occasion";

export type RecipientPronouns = "she_her" | "he_him" | "they_them";

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
 */
export const SITUATION_LINE_DEFAULTS: Record<Occasion, string> = {
  new_baby: "just welcomed {poss} new baby",
  illness_recovery: "not been well lately",
  bereavement: "recently lost someone dear to {obj}",
  ongoing_support: "carrying a lot at the moment",
  other: "got a lot on right now",
};

export const TRUSTED_LINE_DEFAULTS: Record<Occasion, string> = {
  new_baby: "finding {poss} feet with the new baby",
  illness_recovery: "focusing on {poss} recovery at the moment",
  bereavement: "going through a difficult time after a recent loss",
  ongoing_support: "could use a little extra support right now",
  other: "got a lot on right now",
};

export function defaultSituationLine(occasion: Occasion | null): string {
  return SITUATION_LINE_DEFAULTS[occasion ?? "other"];
}

export function defaultTrustedLine(occasion: Occasion | null): string {
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
