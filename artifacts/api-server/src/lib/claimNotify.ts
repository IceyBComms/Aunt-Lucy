/**
 * Bug #013 — the claim confirmation, on whichever channel the helper is
 * actually reachable on.
 *
 * Both claim paths (the public one in routes/slots.ts and the trusted-invite
 * one in routes/invites.ts) call this instead of reaching for the email sender
 * directly. Before this existed the public path sent email-only and returned
 * silently for a phone contact, and the invite path sent nothing at all — so
 * the release link, which for a public claim exists in no other message,
 * reached only the helpers who happened to type an address.
 *
 * The channel decision lives here, once, rather than in each route. The copy
 * lives in item17Copy.ts (SMS) and email.ts (email); this module only chooses
 * and dispatches, in the same shape as item17Notify.ts.
 */

import { classifyContact } from "./contactChannel";
import { sendClaimConfirmation, type ClaimEmailParams } from "./email";
import { sendSms } from "./sms";
import { logger } from "./logger";
import { getAppBaseUrl } from "./appUrl";
import { calendarSubscribeUrl } from "./calendarFeed";
import { firstName } from "./names";
import { helperClaimConfirmed, taskLabel, whenClause } from "./item17Copy";

/** The release link a helper uses to see, change or cancel their claim. */
export function releaseUrlFor(cancelToken: string): string {
  return `${getAppBaseUrl()}/release/${cancelToken}`;
}

export interface ClaimConfirmationParams {
  /** Named in the warning when a contact can't be reached. Never the contact. */
  slotId: string;
  helperFirstName: string;
  helperContact: string | null;
  recipientName: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  notes: string | null;
  dietaryNotes: string | null;
  headcount: number | null;
  location: string | null;
  cancelToken: string;
  calendarToken: string | null;
}

/**
 * Confirm a claim to the helper. Never throws and never blocks the response —
 * both callers fire this without awaiting, exactly as they did the email.
 */
export async function sendClaimConfirmationToHelper(
  params: ClaimConfirmationParams,
): Promise<void> {
  const channel = classifyContact(params.helperContact);
  const releaseUrl = releaseUrlFor(params.cancelToken);

  if (channel === "unknown") {
    // Not routine. A claim exists whose helper cannot be confirmed and cannot be
    // given their release link, so it needs to be visible in the logs. The
    // contact value itself is deliberately absent: it is personal data, and when
    // it is the fallback case it is a person's NAME. The slot id is enough to
    // find the row.
    logger.warn(
      { slotId: params.slotId },
      "Claim confirmation not sent — contact is neither an email address nor a phone number",
    );
    return;
  }

  if (channel === "sms") {
    const body = helperClaimConfirmed({
      helperFirstName: firstName(params.helperFirstName),
      recipientFirstName: firstName(params.recipientName),
      task: taskLabel(params.slotType, params.customLabel),
      whenClause: whenClause(params.slotDate, params.slotTime),
      releaseLink: releaseUrl,
    });
    // The calendar subscription is NOT in this message. It lives on the page the
    // release link opens, so the SMS carries one URL instead of two (a second
    // link would add ~94 characters and another billed segment).
    const ok = await sendSms({
      to: params.helperContact!,
      body,
      label: "helperClaimConfirmed",
    });
    if (!ok) {
      logger.warn({ slotId: params.slotId }, "Claim confirmation SMS was not accepted");
    }
    return;
  }

  const emailParams: ClaimEmailParams = {
    slotId: params.slotId,
    helperFirstName: params.helperFirstName,
    helperContact: params.helperContact!,
    recipientName: params.recipientName,
    slotType: params.slotType,
    customLabel: params.customLabel,
    slotDate: params.slotDate,
    slotTime: params.slotTime,
    notes: params.notes,
    dietaryNotes: params.dietaryNotes,
    headcount: params.headcount,
    location: params.location,
    releaseUrl,
    // Dated tasks only: an undated "whenever suits" offer is not an appointment.
    calendarUrl:
      params.slotDate && params.calendarToken
        ? calendarSubscribeUrl(params.calendarToken)
        : null,
  };
  await sendClaimConfirmation(emailParams);
}
