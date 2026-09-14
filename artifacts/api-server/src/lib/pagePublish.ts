/**
 * May this page go live? (the organiser and crisis setup path)
 *
 * Pure on purpose, in the shape of `canDeleteDraft` next door. Until 14 Sep
 * 2026 the only thing between a half-built page and a live one was a React
 * mount effect: LOADING STEP 3 WAS THE ACTIVATION, the route behind it accepted
 * any page in any state, and nothing asked whether there was anything on it.
 * A frontend button is not a guard — an old link, a back button or a direct
 * request reaches the route without ever seeing it — so the rule lives here,
 * where the route must go through it and a test can reach it with no database,
 * no request and no session.
 */
export type PublishRefusalReason = "not_found" | "not_draft" | "no_tasks";

export type PublishVerdict =
  /** Go ahead. */
  | { ok: true }
  /** Refuse. `reason` is for code and tests; `error` is shown to the person. */
  | { ok: false; status: 404 | 409; reason: PublishRefusalReason; error: string };

/**
 * ⏸️ The two 409 messages are PROPOSED COPY, not ruled — they mirror
 * `noTasks` and `notDraft` in rally's src/lib/setupPublishCopy.ts, and must be
 * changed together with those.
 */
export const PUBLISH_REFUSALS = {
  not_found: { ok: false, status: 404, reason: "not_found", error: "Page not found." },
  not_draft: {
    ok: false,
    status: 409,
    reason: "not_draft",
    error: "This page isn't a draft any more, so there's nothing to make live.",
  },
  no_tasks: {
    ok: false,
    status: 409,
    reason: "no_tasks",
    error: "Add at least one task before the page goes live.",
  },
} as const satisfies Record<PublishRefusalReason, PublishVerdict>;

export interface PublishablePage {
  status: string;
}

export function canPublish(
  page: PublishablePage | null | undefined,
  slots: readonly unknown[],
): PublishVerdict {
  // Ownership is settled before this is called — the route only ever loads the
  // caller's own page — so a missing page is simply not found.
  if (!page) return PUBLISH_REFUSALS.not_found;

  // 1. DRAFT ONLY, checked first. An active page is already live, and a closed
  //    one must not be quietly reopened by a stale step-3 link — that is a
  //    different decision, and not this route's. First, too, because telling
  //    someone to "add a task" to a page that is already live sends them
  //    looking for the wrong fix.
  if (page.status !== "draft") return PUBLISH_REFUSALS.not_draft;

  // 2. AT LEAST ONE TASK. A live page with nothing on it asks people to turn up
  //    for nothing, on the path used in someone's hardest week.
  if (slots.length === 0) return PUBLISH_REFUSALS.no_tasks;

  return { ok: true };
}
