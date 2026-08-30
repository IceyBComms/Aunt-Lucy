/**
 * May this page be thrown away? (bug #071)
 *
 * Pure on purpose. Deleting the WRONG page is far worse than the bug being
 * fixed — helpers have committed to real tasks and a family is depending on
 * them — so the decision is separated from the route that performs it and
 * tested directly, per the lesson recorded on #025: a rule that needs a live
 * database to exercise is a rule that goes unverified.
 */
export type DraftDeletionVerdict =
  /** Go ahead. */
  | { ok: true }
  /** Refuse, with the reason to show the person. */
  | { ok: false; status: 404 | 409; error: string };

export interface DeletablePage {
  status: string;
  /** Null for a gift-created page, which no organiser owns. */
  organiserId: string | null;
}

export function canDeleteDraft(
  page: DeletablePage | null | undefined,
  callerOrganiserId: string,
  hasGift: boolean,
): DraftDeletionVerdict {
  // 1. OWNERSHIP. Also excludes every gift page for free: those are created
  //    with organiserId null, and null never equals a real id.
  if (!page || !page.organiserId || page.organiserId !== callerOrganiserId) {
    return { ok: false, status: 404, error: "Page not found." };
  }

  // 2. STATUS. Draft only — active and closed both refuse.
  if (page.status !== "draft") {
    return {
      ok: false,
      status: 409,
      error: "This page is live, so it can't be deleted. People may already have offered help.",
    };
  }

  // 3. NO GIFT ATTACHED, and this is NOT redundant with either lock above. A
  //    gift page IS created as a draft when the recipient schedules activation
  //    for later (gifts.ts: `status: scheduledActivateAt ? "draft" : "active"`),
  //    so "draft" alone does not mean "disposable". Deleting one would destroy
  //    a page somebody paid $59 for and null its gifts.page_id (that FK is
  //    onDelete "set null"), leaving a gift marked redeemed pointing at nothing.
  if (hasGift) {
    return { ok: false, status: 409, error: "This page came from a gift, so it can't be deleted." };
  }

  return { ok: true };
}
