/**
 * The two decisions behind every helper invite, kept apart on purpose.
 *
 * An invite has a KIND (what it is) and a CHANNEL (how it travels). They are
 * decided by different things and they must not be conflated:
 *
 *   • kind    — decided by whether a TASK was chosen. Pick a slot and it is a
 *               trusted, slot-scoped ask; pick none and it is a general invite
 *               to the whole page.
 *   • channel — decided by the CONTACT FORMAT. An email address is emailed, a
 *               mobile number is texted. Nothing else.
 *
 * Collapsing them into one ternary is bug #031: inviting someone to a
 * trusted-only task by EMAIL produced a *general* invite with no invite token,
 * while the row still pointed at the slot. Because trusted slots are hidden
 * from the public listing and refused by the public claim path, that person
 * could not claim the task they had just been invited to — and nobody was told.
 *
 * The invite token is the grant. It is minted for exactly the invites that need
 * one — the slot-scoped ones — regardless of how the message travels, because
 * the token is what makes a trusted slot claimable at all.
 *
 * Same rule as prepareInvite() in routes/manage.ts, which derives kind from
 * req.slotId and channel from the contact. Stated once here so both readings
 * of it can be tested.
 */

export type InviteKind = "general" | "trusted";
export type InviteChannel = "sms" | "email";

export interface InviteShape {
  kind: InviteKind;
  channel: InviteChannel;
  /**
   * Whether this invite needs its own /invite/:token grant. True exactly when
   * the invite is slot-scoped — never a function of the channel.
   */
  needsInviteToken: boolean;
}

export function inviteShape(params: {
  /** Was a specific task chosen for this invite? */
  slotChosen: boolean;
  /** Is the contact an email address (rather than a mobile number)? */
  contactIsEmail: boolean;
}): InviteShape {
  const kind: InviteKind = params.slotChosen ? "trusted" : "general";
  return {
    kind,
    channel: params.contactIsEmail ? "email" : "sms",
    needsInviteToken: kind === "trusted",
  };
}
