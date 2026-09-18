import { describe, it, expect, vi, beforeEach } from "vitest";

// Bug #123. The thing being tested is not "does an email send" — it is "when a
// send blows up at the network level, can anyone tell". Before this, they could
// not: `resend.emails.send` was awaited with no try/catch anywhere in
// lib/email.ts, and almost every caller is fire-and-forget, so the rejection
// landed in nothing. No log, no error, and the action still reported success.
//
// EVERY absence assertion in this file ("nothing was logged", "it did not
// throw") sits next to a positive one that only a real run can satisfy (P2 —
// an absence test passes for free if the path never ran).

const info = vi.fn((_ctx: Record<string, unknown>, _msg: string) => {});
const warn = vi.fn((_ctx: Record<string, unknown>, _msg: string) => {});
const error = vi.fn((_ctx: Record<string, unknown>, _msg: string) => {});

vi.mock("./logger", () => ({
  logger: {
    info: (c: Record<string, unknown>, m: string) => info(c, m),
    warn: (c: Record<string, unknown>, m: string) => warn(c, m),
    error: (c: Record<string, unknown>, m: string) => error(c, m),
  },
}));

const {
  attemptSend,
  attemptBooleanSend,
  notifySkipped,
  redactEmail,
  redactMobile,
  redactContact,
} = await import("./notifyOutcome");

const META = { label: "giftDelivery", channel: "email" as const, to: "sarah@example.com" };

beforeEach(() => {
  info.mockClear();
  warn.mockClear();
  error.mockClear();
});

describe("a transport that THROWS", () => {
  it("is caught, logged as failed, and answered in the { error } shape", async () => {
    const send = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    const result = await attemptSend(META, send);

    // Positive control: the send really ran. Without this the two absence
    // assertions below would pass on a path that never executed.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toBe("ECONNRESET");

    expect(error).toHaveBeenCalledTimes(1);
    const [ctx, msg] = error.mock.calls[0];
    expect(msg).toBe("Notification failed");
    expect(ctx.label).toBe("giftDelivery");
    expect(ctx.channel).toBe("email");
    expect(String(ctx.reason)).toContain("ECONNRESET");

    // And it is NOT logged as a success.
    expect(info).not.toHaveBeenCalled();
  });

  it("never throws past its caller", async () => {
    await expect(
      attemptSend(META, async () => {
        throw new Error("socket hang up");
      }),
    ).resolves.toBeDefined();
    // Paired positive: resolving is only meaningful if a failure was recorded.
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("turns a boolean-shaped send into false", async () => {
    const send = vi.fn(async () => {
      throw new Error("Twilio unreachable");
    });

    await expect(attemptBooleanSend({ ...META, channel: "sms", to: "+61412345789" }, send)).resolves.toBe(
      false,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toBe("Notification failed");
  });
});

describe("a transport that RETURNS { error } — the behaviour that already worked", () => {
  it("is passed through to the caller unchanged", async () => {
    const providerError = { name: "validation_error", message: "Invalid `to` field" };
    const result = await attemptSend(META, async () => ({ error: providerError }));

    // The SAME object, not a copy: every caller's `if (error)` branch keeps its
    // existing policy (throw on, return false, or log and carry on).
    expect(result.error).toBe(providerError);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0].reason)).toBe("Invalid `to` field");
    expect(info).not.toHaveBeenCalled();
  });
});

describe("a transport that SUCCEEDS", () => {
  it("logs exactly one success line and returns no error", async () => {
    const result = await attemptSend(META, async () => ({ error: null }));

    expect(result.error).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toBe("Notification sent");
    expect(info.mock.calls[0][0]).toMatchObject({ label: "giftDelivery", channel: "email" });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("carries the caller's extra detail onto the line", async () => {
    await attemptSend({ ...META, pageId: "page-1", detail: { claims: 3 } }, async () => ({
      error: null,
    }));
    expect(info.mock.calls[0][0]).toMatchObject({ pageId: "page-1", claims: 3 });
  });
});

describe("sent / skipped / failed are three different things", () => {
  it("a skip says so, and says why", async () => {
    notifySkipped(META, "RESEND_API_KEY not set");

    expect(warn).toHaveBeenCalledTimes(1);
    const [ctx, msg] = warn.mock.calls[0];
    expect(msg).toBe("Notification skipped");
    expect(ctx.reason).toBe("RESEND_API_KEY not set");
    // Not a success and not a failure — the confusion bug #102 could not see past.
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("what reaches the log (bug #116)", () => {
  it("keeps an email's domain and drops the person", () => {
    expect(redactEmail("sarah.chen@bigpond.com")).toBe("…@bigpond.com");
    expect(redactEmail("sarah.chen@bigpond.com")).not.toContain("sarah");
  });

  it("keeps the last three digits of a mobile and nothing else", () => {
    expect(redactMobile("+61 412 345 789")).toBe("…789");
    expect(redactMobile("0412345789")).toBe("…789");
  });

  it("gives a contact that is really a NAME no letters at all", () => {
    expect(redactContact("Jane Smith")).toBe("…");
  });

  it("redacts the destination on every one of the three lines", async () => {
    const to = "sarah.chen@bigpond.com";
    await attemptSend({ ...META, to }, async () => ({ error: null }));
    await attemptSend({ ...META, to }, async () => {
      throw new Error("ECONNRESET");
    });
    notifySkipped({ ...META, to }, "opted out");

    const written = [...info.mock.calls, ...error.mock.calls, ...warn.mock.calls];
    // Positive control: all three lines really were written.
    expect(written).toHaveLength(3);
    for (const [ctx] of written) {
      expect(ctx.to).toBe("…@bigpond.com");
      expect(JSON.stringify(ctx)).not.toContain("sarah.chen");
    }
  });

  it("handles a missing destination without inventing one", async () => {
    await attemptSend({ ...META, to: null }, async () => ({ error: null }));
    expect(info.mock.calls[0][0].to).toBe("none");
  });
});
