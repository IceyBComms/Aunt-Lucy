/**
 * "Someone claimed a task" — the addressee rule, and the SMS wording.
 *
 * ── Why the addressee rule is shared (bug #025, Kate's ruling) ───────────────
 * This notice was written for the RECIPIENT, then bug #025's fix started
 * sending it to managers too. Unchanged, it tells the sister running the page
 * that someone has "shown up for you" and that "you're being looked after" —
 * addressing the carer as though she were the cared-for. Same family as #039.
 *
 * The fix is ONE swap applied consistently, not a second set of strings: the
 * reader who IS the page's person reads "you", anyone else reads her name.
 * Plural forms and the bereavement register are untouched by it.
 *
 * It lives here rather than inside the email builder because the email and the
 * SMS say the same thing on two channels. Two copies of one rule is how the
 * claim path and the release path drifted apart in the first place.
 */
export type ClaimAddressee = {
  /** "you" | "Nadia" */
  addressee: string;
  /** "your" | "Nadia's" */
  possessive: string;
  /** "Your" | "Nadia's" — sentence-initial. */
  possessiveCap: string;
  /** "you're being looked after" | "Nadia is being looked after" */
  beingLookedAfter: string;
};

export function claimAddressee(
  recipientFirstName: string,
  isRecipient: boolean,
): ClaimAddressee {
  return {
    addressee: isRecipient ? "you" : recipientFirstName,
    possessive: isRecipient ? "your" : `${recipientFirstName}'s`,
    possessiveCap: isRecipient ? "Your" : `${recipientFirstName}'s`,
    beingLookedAfter: isRecipient
      ? "you're being looked after"
      : `${recipientFirstName} is being looked after`,
  };
}

/**
 * The SMS body. Approved copy — change it here, not at the call site.
 *
 * ⚠️ GSM-7 DISCIPLINE, and it is deliberate on every character (Kate's ruling,
 * bug #025). The email carries a 💛; a single emoji would force the WHOLE
 * message into UCS-2 and cut the per-segment budget from 153 characters to 67,
 * roughly doubling the bill. So: no emoji, straight apostrophes (U+0027, never
 * U+2019), and hyphens rather than em dashes — the em dash alone costs 11 of
 * the 16 live SMS bodies a segment (see PR #59). Anything added here must stay
 * inside the GSM-7 basic set; `measureSms` in lib/smsSegments will say so.
 *
 * The management link is the long pole, not the words: a grant token is 32
 * random bytes hex, so the URL alone is ~99 characters of the budget.
 */
export function buildRecipientClaimSms(params: {
  recipientFirstName: string;
  isRecipient: boolean;
  claimCount: number;
  manageLink: string;
  occasion?: string | null;
}): string {
  const { addressee, possessive, possessiveCap } = claimAddressee(
    params.recipientFirstName,
    params.isRecipient,
  );
  const single = params.claimCount === 1;
  const bereavement = params.occasion === "bereavement";

  if (bereavement) {
    return single
      ? `A gentle note: someone has stepped in to help ${addressee}. ${params.manageLink}`
      : `A gentle note: a few of ${possessive} people have stepped in. ${params.manageLink}`;
  }
  return single
    ? `Someone's just shown up for ${addressee}. See what they've offered: ${params.manageLink}`
    : `${possessiveCap} people are showing up - a few have offered help. See what's happening: ${params.manageLink}`;
}
