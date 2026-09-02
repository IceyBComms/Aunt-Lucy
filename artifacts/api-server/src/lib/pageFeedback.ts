/**
 * The feedback button's three decisions, with no database and no send.
 *
 * Pure on purpose, following draftDeletion.ts and the lesson recorded on #025:
 * a rule that needs a live database to exercise is a rule that goes unverified.
 * The route around this does exactly two things this module cannot — write a
 * row and try to send an email — and it does them in that order.
 *
 * Nothing here talks to Postgres, Resend or Express. It answers:
 *   1. is the form shown at all?            → feedbackFormVisible
 *   2. is this submission worth keeping?    → readFeedbackSubmission
 *   3. what does the email to Kate say?     → buildFeedbackNotification
 *
 * COPY WARNING. The strings in this file are read by someone whose person has
 * just died. They are Kate's approved words and they are first person and
 * signed on purpose — a person asking is answerable; a brand asking is a
 * survey (#095). Nothing cheery, no exclamation marks, no emoji, no "would you
 * recommend Aunt Lucy" — that last one is asking a grieving person to do
 * marketing. Do not reword any of it without Kate.
 */
import { type Occasion } from "./occasion";

// ─── 1. Is the form shown? ───────────────────────────────────────────────────

/**
 * The form appears once at least one task on the page has been claimed, and
 * then stays forever — no dismissal, no "remind me later", nothing to store.
 *
 * A cheap condition for a much better signal: someone whose page has had no
 * claims has nothing to report yet, and asking them reads as a product fishing
 * rather than listening.
 *
 * NOTE THIS IS A PRESENTATION RULE, NOT AN ACCEPTANCE RULE. The route
 * deliberately does not gate the POST on it. If a helper releases the only
 * claim while the form is open on someone's phone, the words they are part-way
 * through typing must still be accepted when they press send — refusing them
 * would be the same silent loss this whole build exists to prevent.
 */
export function feedbackFormVisible(
  tasks: readonly { isClaimed: boolean | null }[],
): boolean {
  return tasks.some((t) => t.isClaimed === true);
}

/**
 * The outcome of asking "has this person already left feedback?" — which is a
 * question that can FAIL, separately from its answer being yes or no.
 */
export type FeedbackLookup =
  /** The table answered. */
  | { ok: true; alreadyGiven: boolean }
  /** The lookup blew up. Nothing is known, and the block is not offered. */
  | { ok: false };

/**
 * Runs the "already given?" lookup and swallows any failure into `{ ok: false }`,
 * reporting it to `onError` so it is loud in the logs rather than silent.
 *
 * ⚠️ THE FEEDBACK FORM MUST NOT BE ABLE TO TAKE DOWN /manage. That page is where
 * an organiser runs everything — the tasks, the people, the invites, who has
 * access — and a feedback box is the least important thing on it by a wide
 * margin. This guard exists because the failure is not hypothetical: during this
 * build the whole manage route 500'd on a database branch where page_feedback
 * did not exist yet. Same shape as #077, where one unguarded call took a whole
 * screen with it and left a live button on an empty form.
 *
 * It takes the query as a function rather than running one, so this module still
 * touches no database and the guard is exercisable by a test that actually runs.
 *
 * What it protects, now that 0015 is applied to production: a fresh Neon branch,
 * a rollback, a restored copy, a future environment where the table is behind —
 * and it turns the deploy ordering for 0015 from "enforced by breakage" into
 * "prudent", which is the honest description of it.
 */
export async function lookupFeedbackSafely(
  find: () => Promise<boolean>,
  onError: (err: unknown) => void,
): Promise<FeedbackLookup> {
  try {
    return { ok: true, alreadyGiven: await find() };
  } catch (err) {
    onError(err);
    return { ok: false };
  }
}

/**
 * What the manage view shows for feedback: whether to offer the block at all,
 * and whether this person has already answered.
 *
 * A FAILED LOOKUP HIDES THE WHOLE BLOCK — it does not fall back to showing the
 * form. If the read failed there is every chance the write would fail too, and
 * offering a box that then loses what someone typed is worse than not offering
 * one at all. Not asking costs a piece of feedback; asking and dropping it costs
 * the person's goodwill and tells them nothing went wrong (#102).
 */
export function feedbackBlockState(
  tasks: readonly { isClaimed: boolean | null }[],
  lookup: FeedbackLookup,
): { feedbackVisible: boolean; feedbackGiven: boolean } {
  if (!lookup.ok) return { feedbackVisible: false, feedbackGiven: false };
  return {
    feedbackVisible: feedbackFormVisible(tasks),
    feedbackGiven: lookup.alreadyGiven,
  };
}

// ─── 2. Is this submission worth keeping? ────────────────────────────────────

/** A generous ceiling. Nobody writes this much; a runaway paste might. */
export const FEEDBACK_FIELD_MAX = 10_000;

export interface FeedbackSubmission {
  wentWell: string | null;
  gotInTheWay: string | null;
}

export type FeedbackVerdict =
  | { ok: true; value: FeedbackSubmission }
  | { ok: false; status: 400; error: string };

/**
 * Both fields are optional; either one alone is a complete answer. Only two
 * things are refused, and both refusals are plain rather than told off —
 * whoever is reading them may have just written about a death.
 *
 * Empty strings are normalised to null so an untouched box is stored as "not
 * answered" rather than as an answer of "".
 */
export function readFeedbackSubmission(body: {
  wentWell?: unknown;
  gotInTheWay?: unknown;
}): FeedbackVerdict {
  const wentWell = clean(body.wentWell);
  const gotInTheWay = clean(body.gotInTheWay);

  if (!wentWell && !gotInTheWay) {
    return { ok: false, status: 400, error: "There's nothing to send yet." };
  }
  if (
    (wentWell?.length ?? 0) > FEEDBACK_FIELD_MAX ||
    (gotInTheWay?.length ?? 0) > FEEDBACK_FIELD_MAX
  ) {
    return {
      ok: false,
      status: 400,
      error: "That's longer than this box can hold, sorry.",
    };
  }

  return { ok: true, value: { wentWell, gotInTheWay } };
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// ─── 2b. Is this person sending more than a person could? ────────────────────

/**
 * Ten submissions per grant per hour.
 *
 * ⚠️ THIS IS NOT A SECURITY CONTROL, AND IT SHOULD NOT BE REASONED ABOUT AS ONE.
 * The endpoint already sits behind a 32-random-byte management token, so nobody
 * reaches it by guessing. The thing being protected is the FEATURE: this whole
 * build is worth something only because Kate reads every one of these herself,
 * so anything capable of flooding hello@auntlucy.com.au attacks the feature
 * rather than the server. The realistic case is not an attacker — it is a stuck
 * client retrying.
 *
 * Ten an hour will never trouble a real person. Someone who thinks of three more
 * things after sending, and sends them one at a time, is nowhere near it.
 */
export const FEEDBACK_RATE_LIMIT = {
  limit: 10,
  windowMs: 60 * 60 * 1000,
} as const;

/**
 * KEYED ON THE GRANT, so one page can never affect another — and, within a page,
 * one manager's runaway client can never use up the recipient's allowance. The
 * "feedback:" prefix namespaces it away from every other limiter (see
 * lib/rateLimit.ts, where keys are caller-namespaced by contract).
 */
export function feedbackRateLimitKey(grantId: string): string {
  return `feedback:${grantId}`;
}

/**
 * What the person meets when the limit trips — a plain line, never an error
 * page. They have done nothing wrong, and on a bereavement page an error wall
 * for "you cared too much, too fast" would be grotesque.
 *
 * IT MUST NOT CLAIM THE WORDS WERE SAVED, because at this point they were not:
 * the limit is checked before the row is written. What it CAN truthfully say is
 * that the text is still sitting in the box — the form is not cleared unless the
 * submission succeeded — so nothing has to be retyped. Saying "nothing's lost"
 * when a row was never written would be the #102 lie in miniature.
 */
export const FEEDBACK_RATE_LIMITED =
  "That's a lot in one go. What you've written is still here — give it a little while and send it again.";

// ─── 3. What does the email to Kate say? ─────────────────────────────────────

/**
 * How each occasion is named in the notification.
 *
 * THE OCCASION IS NOT DECORATION. The same sentence — "nobody came for the
 * first few days" — reads completely differently under a new baby and under a
 * bereavement, and Kate should never have to go and look up which one she is
 * reading before she knows how to read it.
 */
export const FEEDBACK_OCCASION_LABELS: Record<Occasion, string> = {
  new_baby: "new baby",
  illness_recovery: "illness or recovery",
  surgery: "surgery",
  bereavement: "bereavement",
  ongoing_support: "ongoing support",
  other: "other",
};

/** Null occasion is legacy or crisis-created; say so rather than guessing. */
export function feedbackOccasionLabel(occasion: Occasion | null): string {
  return occasion ? FEEDBACK_OCCASION_LABELS[occasion] : "not recorded";
}

export interface FeedbackNotificationParams {
  /** Whose page it is — "Sarah", not the slug. */
  recipientName: string;
  occasion: Occasion | null;
  /** Human date, already formatted by the caller (which owns the timezone). */
  receivedAt: string;
  submission: FeedbackSubmission;
}

export const FEEDBACK_QUESTION_ONE = "Did people show up? Tell us how it went.";
export const FEEDBACK_QUESTION_TWO = "Anything get in the way?";
const NOT_ANSWERED = "(left blank)";

/**
 * The subject carries the name AND the occasion, so the inbox list alone tells
 * Kate how to read what is inside before she opens it.
 */
export function buildFeedbackNotification(params: FeedbackNotificationParams): {
  subject: string;
  text: string;
  /** The body as sections, so the HTML build renders the same thing. */
  sections: Array<{ question: string; answer: string; answered: boolean }>;
  facts: Array<[string, string]>;
} {
  const occasion = feedbackOccasionLabel(params.occasion);
  const subject = `Feedback — ${params.recipientName}'s page (${occasion})`;

  const facts: Array<[string, string]> = [
    ["Page", `${params.recipientName}'s page`],
    ["Occasion", occasion],
    ["Received", params.receivedAt],
  ];

  const sections = [
    { question: FEEDBACK_QUESTION_ONE, answer: params.submission.wentWell },
    { question: FEEDBACK_QUESTION_TWO, answer: params.submission.gotInTheWay },
  ].map((s) => ({
    question: s.question,
    answer: s.answer ?? NOT_ANSWERED,
    answered: s.answer !== null,
  }));

  const text = [
    `Someone left feedback on their Aunt Lucy page.`,
    ``,
    ...facts.map(([k, v]) => `${k}: ${v}`),
    ``,
    ...sections.flatMap((s) => [s.question, s.answer, ``]),
    `This is stored on the page as well as sent here, so it is not lost if this email fails.`,
    `Never shown on any page. Never quoted anywhere without asking this person first.`,
  ].join("\n");

  return { subject, text, sections, facts };
}
