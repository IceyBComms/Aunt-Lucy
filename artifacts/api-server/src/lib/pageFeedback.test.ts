/**
 * The feedback button's three decisions, exercised without a database or a send.
 *
 * The copy assertions here are NOT typechecking dressed up as tests — they are
 * the register guard. This box is opened by someone whose person has just died,
 * and the failure mode is a well-meaning later edit adding an exclamation mark,
 * an emoji, or a "would you recommend us". Those are pinned below so the edit
 * has to be deliberate.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  feedbackFormVisible,
  feedbackBlockState,
  lookupFeedbackSafely,
  readFeedbackSubmission,
  buildFeedbackNotification,
  feedbackOccasionLabel,
  FEEDBACK_FIELD_MAX,
  FEEDBACK_QUESTION_ONE,
  FEEDBACK_QUESTION_TWO,
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RATE_LIMITED,
  feedbackRateLimitKey,
} from "./pageFeedback";
import { hitRateLimit, __resetRateLimitsForTest } from "./rateLimit";

describe("is the form shown?", () => {
  it("is hidden on a page with no tasks at all", () => {
    expect(feedbackFormVisible([])).toBe(false);
  });

  it("is hidden while every task is unclaimed — nothing has happened to report", () => {
    expect(feedbackFormVisible([{ isClaimed: false }, { isClaimed: false }])).toBe(false);
  });

  it("appears as soon as ONE task is claimed", () => {
    expect(feedbackFormVisible([{ isClaimed: false }, { isClaimed: true }])).toBe(true);
  });

  it("treats a null claim flag as unclaimed rather than as truthy", () => {
    expect(feedbackFormVisible([{ isClaimed: null }])).toBe(false);
  });
});

describe("the feedback block must never take /manage down", () => {
  // The server-side twin of #077. This is not hypothetical: during the build the
  // whole manage route 500'd on a branch where page_feedback did not exist yet,
  // and /manage is where an organiser runs everything — tasks, people, invites,
  // access. A feedback box is the least important thing on that page.
  const claimed = [{ isClaimed: true }];

  it("shows the form normally when the lookup succeeds and nobody has answered", () => {
    expect(feedbackBlockState(claimed, { ok: true, alreadyGiven: false })).toEqual({
      feedbackVisible: true,
      feedbackGiven: false,
    });
  });

  it("shows the thank-you when the lookup says this person already answered", () => {
    expect(feedbackBlockState(claimed, { ok: true, alreadyGiven: true })).toEqual({
      feedbackVisible: true,
      feedbackGiven: true,
    });
  });

  it("DROPS the whole block when the lookup failed — the rest of the page stands", () => {
    expect(feedbackBlockState(claimed, { ok: false })).toEqual({
      feedbackVisible: false,
      feedbackGiven: false,
    });
  });

  it("hides rather than falls back to the form, so nothing can be typed and lost", () => {
    // If the read failed the write may fail too. Not asking costs a piece of
    // feedback; asking and dropping it costs the person's goodwill and tells
    // them nothing went wrong — which is #102 exactly.
    const failed = feedbackBlockState(claimed, { ok: false });
    expect(failed.feedbackVisible).toBe(false);
  });

  it("swallows a thrown lookup into ok:false and reports it, rather than propagating", async () => {
    const seen: unknown[] = [];
    const boom = new Error("relation \"page_feedback\" does not exist");
    const result = await lookupFeedbackSafely(
      () => Promise.reject(boom),
      (err) => seen.push(err),
    );
    expect(result).toEqual({ ok: false });
    // Loud, not silent: the error reaches the logger with the real cause.
    expect(seen).toEqual([boom]);
  });

  it("swallows a SYNCHRONOUS throw too, not just a rejected promise", async () => {
    const seen: unknown[] = [];
    const result = await lookupFeedbackSafely(
      () => {
        throw new Error("connection terminated");
      },
      (err) => seen.push(err),
    );
    expect(result).toEqual({ ok: false });
    expect(seen).toHaveLength(1);
  });

  it("passes the answer straight through when nothing goes wrong", async () => {
    const noop = () => {
      throw new Error("onError must not be called on the happy path");
    };
    expect(await lookupFeedbackSafely(() => Promise.resolve(true), noop)).toEqual({
      ok: true,
      alreadyGiven: true,
    });
    expect(await lookupFeedbackSafely(() => Promise.resolve(false), noop)).toEqual({
      ok: true,
      alreadyGiven: false,
    });
  });

  it("end to end: a thrown lookup becomes a hidden block", async () => {
    const lookup = await lookupFeedbackSafely(
      () => Promise.reject(new Error("42P01")),
      () => {},
    );
    expect(feedbackBlockState(claimed, lookup)).toEqual({
      feedbackVisible: false,
      feedbackGiven: false,
    });
  });
});

describe("is this submission worth keeping?", () => {
  it("accepts field 1 alone", () => {
    const v = readFeedbackSubmission({ wentWell: "Four meals turned up. I cried." });
    expect(v).toEqual({
      ok: true,
      value: { wentWell: "Four meals turned up. I cried.", gotInTheWay: null },
    });
  });

  it("accepts field 2 alone", () => {
    const v = readFeedbackSubmission({ gotInTheWay: "The link didn't work on Mum's iPad." });
    expect(v).toEqual({
      ok: true,
      value: { wentWell: null, gotInTheWay: "The link didn't work on Mum's iPad." },
    });
  });

  it("accepts both", () => {
    const v = readFeedbackSubmission({ wentWell: "Good", gotInTheWay: "Slow" });
    expect(v).toMatchObject({ ok: true, value: { wentWell: "Good", gotInTheWay: "Slow" } });
  });

  it("refuses both empty, and does so plainly — no telling-off", () => {
    const v = readFeedbackSubmission({});
    expect(v).toEqual({ ok: false, status: 400, error: "There's nothing to send yet." });
  });

  it("treats whitespace-only as empty, so a stray space is not an answer", () => {
    expect(readFeedbackSubmission({ wentWell: "   ", gotInTheWay: "\n\t" }).ok).toBe(false);
  });

  it("ignores non-string junk rather than storing it", () => {
    expect(readFeedbackSubmission({ wentWell: 42, gotInTheWay: { a: 1 } }).ok).toBe(false);
  });

  it("trims, so a pasted answer isn't stored with its trailing newline", () => {
    expect(readFeedbackSubmission({ wentWell: "  she came every day  " })).toMatchObject({
      value: { wentWell: "she came every day" },
    });
  });

  it("takes a long, real answer — the ceiling is for runaway pastes only", () => {
    expect(readFeedbackSubmission({ wentWell: "a".repeat(FEEDBACK_FIELD_MAX) }).ok).toBe(true);
    expect(readFeedbackSubmission({ wentWell: "a".repeat(FEEDBACK_FIELD_MAX + 1) }).ok).toBe(false);
  });
});

describe("nothing may flood Kate's inbox", () => {
  // NOT a security control — the endpoint is already behind a 32-random-byte
  // management token. What is protected is the FEATURE: this is only worth
  // something because every one of these gets read, so a flood attacks the
  // feature rather than the server. The realistic case is a stuck client.
  beforeEach(() => __resetRateLimitsForTest());

  const hit = (grantId: string) =>
    hitRateLimit(
      feedbackRateLimitKey(grantId),
      FEEDBACK_RATE_LIMIT.limit,
      FEEDBACK_RATE_LIMIT.windowMs,
    ).limited;

  it("is ten an hour — a figure no real person reaches", () => {
    expect(FEEDBACK_RATE_LIMIT.limit).toBe(10);
    expect(FEEDBACK_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
  });

  it("lets ten through and refuses the eleventh", () => {
    const results = Array.from({ length: 11 }, () => hit("grant-1"));
    expect(results.slice(0, 10)).toEqual(Array(10).fill(false));
    expect(results[10]).toBe(true);
  });

  it("KEYED ON THE GRANT — one page can never affect another", () => {
    for (let i = 0; i < 11; i++) hit("grant-1");
    expect(hit("grant-1")).toBe(true);
    // A different page, untouched, still has its full allowance.
    expect(hit("grant-2")).toBe(false);
  });

  it("keeps two managers of the SAME page independent of each other", () => {
    // Grants are per person, so a manager's runaway client cannot use up the
    // recipient's allowance on her own page.
    for (let i = 0; i < 11; i++) hit("sister-grant");
    expect(hit("sister-grant")).toBe(true);
    expect(hit("recipient-grant")).toBe(false);
  });

  it("namespaces the key away from every other limiter", () => {
    expect(feedbackRateLimitKey("abc")).toBe("feedback:abc");
    expect(feedbackRateLimitKey("abc")).not.toBe(feedbackRateLimitKey("abd"));
  });

  it("refuses with a plain line, not a telling-off", () => {
    expect(FEEDBACK_RATE_LIMITED).toBe(
      "That's a lot in one go. What you've written is still here — give it a little while and send it again.",
    );
    expect(FEEDBACK_RATE_LIMITED).not.toContain("!");
    expect(/\p{Extended_Pictographic}/u.test(FEEDBACK_RATE_LIMITED)).toBe(false);
  });

  it("does NOT claim the words were saved — the row is not written when it trips", () => {
    // "Nothing's lost" would be the #102 lie in miniature. What is true, and
    // what it says, is that the text is still sitting in the box.
    const lower = FEEDBACK_RATE_LIMITED.toLowerCase();
    expect(lower).not.toContain("nothing's lost");
    expect(lower).not.toContain("got it");
    expect(lower).not.toContain("received");
    expect(lower).toContain("still here");
  });
});

describe("what the email says", () => {
  const base = {
    recipientName: "Sarah",
    receivedAt: "Wednesday, 2 September 2026",
  };

  it("carries the page name AND the occasion in the subject", () => {
    const built = buildFeedbackNotification({
      ...base,
      occasion: "bereavement",
      submission: { wentWell: "People came.", gotInTheWay: null },
    });
    expect(built.subject).toBe("Feedback — Sarah's page (bereavement)");
  });

  it("reads differently under a different occasion — the whole reason it's there", () => {
    const words = { wentWell: "Nobody came for the first few days.", gotInTheWay: null };
    const grief = buildFeedbackNotification({ ...base, occasion: "bereavement", submission: words });
    const baby = buildFeedbackNotification({ ...base, occasion: "new_baby", submission: words });
    expect(grief.subject).not.toBe(baby.subject);
    expect(grief.text).toContain("Occasion: bereavement");
    expect(baby.text).toContain("Occasion: new baby");
  });

  it("says so rather than guessing when the page has no occasion", () => {
    expect(feedbackOccasionLabel(null)).toBe("not recorded");
  });

  it("names every occasion in the enum, so a new one can't render as blank", () => {
    for (const o of [
      "new_baby",
      "illness_recovery",
      "surgery",
      "bereavement",
      "ongoing_support",
      "other",
    ] as const) {
      // Human words, never the raw enum: "illness_recovery" in a subject line
      // is the same leak as #048's bare "failed" beside a friend's name.
      expect(feedbackOccasionLabel(o)).toBeTruthy();
      expect(feedbackOccasionLabel(o)).not.toContain("_");
    }
  });

  it("keeps both questions and marks the unanswered one, rather than dropping it", () => {
    const built = buildFeedbackNotification({
      ...base,
      occasion: "surgery",
      submission: { wentWell: null, gotInTheWay: "Couldn't change the date." },
    });
    expect(built.sections.map((s) => s.question)).toEqual([
      FEEDBACK_QUESTION_ONE,
      FEEDBACK_QUESTION_TWO,
    ]);
    expect(built.sections[0]).toMatchObject({ answered: false, answer: "(left blank)" });
    expect(built.sections[1]).toMatchObject({ answered: true });
    expect(built.text).toContain("Couldn't change the date.");
  });

  it("tells Kate in the body that the row exists, so a missing email isn't a lost answer", () => {
    const built = buildFeedbackNotification({
      ...base,
      occasion: "other",
      submission: { wentWell: "Fine", gotInTheWay: null },
    });
    expect(built.text).toContain("stored on the page as well as sent here");
  });

  it("carries the standing rule about testimonials where Kate will actually read it", () => {
    const built = buildFeedbackNotification({
      ...base,
      occasion: "other",
      submission: { wentWell: "Fine", gotInTheWay: null },
    });
    expect(built.text).toContain("without asking this person first");
  });
});

describe("the register", () => {
  const strings = [FEEDBACK_QUESTION_ONE, FEEDBACK_QUESTION_TWO];

  it("asks what happened, not how we did — a story, not an assessment", () => {
    expect(FEEDBACK_QUESTION_ONE).toBe("Did people show up? Tell us how it went.");
    expect(FEEDBACK_QUESTION_TWO).toBe("Anything get in the way?");
  });

  it("has no exclamation marks and no emoji anywhere", () => {
    for (const s of strings) {
      expect(s).not.toContain("!");
      // Any emoji / pictographic character.
      expect(/\p{Extended_Pictographic}/u.test(s)).toBe(false);
    }
  });

  it("never asks a grieving person to do marketing", () => {
    for (const s of strings) {
      expect(s.toLowerCase()).not.toContain("recommend");
      expect(s.toLowerCase()).not.toContain("rate");
      expect(s.toLowerCase()).not.toContain("score");
    }
  });
});
