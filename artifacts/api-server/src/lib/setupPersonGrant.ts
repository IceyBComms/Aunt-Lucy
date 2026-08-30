/**
 * What grant does the SETUP PERSON get on a page they just created? (bug #081)
 *
 * NO DATABASE IN THIS FILE, deliberately — the same split as lib/notifyTargets,
 * for the same reason. #025 went eight days unverified in production because
 * the rule that mattered could only be exercised against a live Neon branch.
 * The insert lives in lib/accessGrants; the decision lives here and is tested.
 *
 * The ROLE is not merely about access. It becomes `isRecipient` on the
 * notification target, which drives the addressee swap in every claim message:
 * "someone's shown up for you" versus "for Val". Choosing wrong tells a
 * grieving person about themselves in the third person.
 */
export interface SetupPersonGrantInput {
  role: "recipient" | "manager";
  personName: string | null;
  personContact: string;
}

/**
 * What grant does the setup person get? Pure, so it can be tested without a
 * database — the #025 lesson, and this decision is worth the seam because the
 * ROLE is not just about access. It drives `isRecipient` on the notification
 * target, which drives the addressee swap in every claim message. Get it wrong
 * and a grieving person is told about themselves in the third person.
 */
export function setupPersonGrantInput(opts: {
  contact: string;
  name: string | null;
  forSelf: boolean;
}): SetupPersonGrantInput {
  return {
    role: opts.forSelf ? "recipient" : "manager",
    personName: opts.name?.trim() || null,
    personContact: opts.contact.trim(),
  };
}
