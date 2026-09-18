import { describe, it, expect, vi, beforeEach } from "vitest";

// Bug #123, the caller's side. Both of these are reached as
// `void notifyRecipientOfTaskEvent(...)` / `void notifyHelperOfTaskEvent(...)`
// (routes/slots.ts, routes/manage.ts), so anything that escapes them escapes
// into an unhandled rejection — which is silence, not an error.

const sendItem17Email = vi.fn(async (_args: unknown) => true);
const sendSms = vi.fn(async (_args: unknown) => true);
const isContactSuppressed = vi.fn(async (_c: string) => false);

vi.mock("./email", () => ({ sendItem17Email: (a: unknown) => sendItem17Email(a) }));
vi.mock("./sms", () => ({ sendSms: (a: unknown) => sendSms(a) }));
vi.mock("./notifyTargetsDb", () => ({
  isContactSuppressed: (c: string) => isContactSuppressed(c),
  resolvePageNotifyTargets: async () => [],
}));

const info = vi.fn((_c: Record<string, unknown>, _m: string) => {});
const warn = vi.fn((_c: Record<string, unknown>, _m: string) => {});
const error = vi.fn((_c: Record<string, unknown>, _m: string) => {});
vi.mock("./logger", () => ({
  logger: {
    info: (c: Record<string, unknown>, m: string) => info(c, m),
    warn: (c: Record<string, unknown>, m: string) => warn(c, m),
    error: (c: Record<string, unknown>, m: string) => error(c, m),
  },
}));

const { notifyHelperOfTaskEvent, notifyRecipientOfTaskEvent } = await import("./item17Notify");

const helperArgs = {
  helperContact: "priya@example.com",
  body: "Sarah has cancelled Friday's meal.",
  emailSubject: "A task has changed",
};

beforeEach(() => {
  sendItem17Email.mockReset().mockResolvedValue(true);
  sendSms.mockReset().mockResolvedValue(true);
  isContactSuppressed.mockReset().mockResolvedValue(false);
  info.mockClear();
  warn.mockClear();
  error.mockClear();
});

describe("telling a helper their task changed", () => {
  it("does not crash when the email sender throws, and says so", async () => {
    sendItem17Email.mockRejectedValue(new Error("ECONNRESET"));

    await expect(notifyHelperOfTaskEvent(helperArgs)).resolves.toBeUndefined();

    // Positive control: resolving means nothing unless the send was attempted.
    expect(sendItem17Email).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toBe("Notification failed");
    expect(error.mock.calls[0][0].label).toBe("helperTaskEvent");
  });

  it("does not crash when the SMS sender throws", async () => {
    sendSms.mockRejectedValue(new Error("Twilio unreachable"));

    await expect(
      notifyHelperOfTaskEvent({ ...helperArgs, helperContact: "0412345789" }),
    ).resolves.toBeUndefined();

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0].channel).toBe("sms");
  });

  it("says out loud that there was nobody to tell", async () => {
    // Was a bare `return`, indistinguishable from a send that blew up.
    await notifyHelperOfTaskEvent({ ...helperArgs, helperContact: null });

    expect(sendItem17Email).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBe("Notification skipped");
    expect(String(warn.mock.calls[0][0].reason)).toContain("no contact on file");
  });

  it("names opting out as the reason, not a failure", async () => {
    isContactSuppressed.mockResolvedValue(true);

    await notifyHelperOfTaskEvent(helperArgs);

    expect(sendItem17Email).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0].reason).toBe("helper opted out");
    expect(error).not.toHaveBeenCalled();
  });

  it("logs one success line when it does go", async () => {
    await notifyHelperOfTaskEvent(helperArgs);

    expect(sendItem17Email).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("telling the family a task changed", () => {
  const page = { id: "page-1", status: "active" } as never;
  const opts = {
    flexibility: "fixed" as const,
    slotDate: "2026-09-25",
    message: { subject: "A task has changed", body: "Priya can't make Friday." },
  };

  it("one target's throw does not cost the targets behind them", async () => {
    sendSms.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue(true);

    const senders = {
      resolveTargets: async () => [
        { mobile: "0412345111", email: null, isRecipient: true, personName: "Sarah", token: null },
        { mobile: "0412345222", email: null, isRecipient: false, personName: "Mel", token: null },
      ],
      isSuppressed: async () => false,
      sendSms,
      sendEmail: sendItem17Email,
    } as never;

    await expect(notifyRecipientOfTaskEvent(page, opts, senders)).resolves.toBeUndefined();

    // The second target was still reached — the whole point.
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0].pageId).toBe("page-1");
  });

  it("falls back to the other channel when the preferred one throws", async () => {
    sendSms.mockRejectedValue(new Error("Twilio unreachable"));

    const senders = {
      resolveTargets: async () => [
        {
          mobile: "0412345111",
          email: "sarah@example.com",
          isRecipient: true,
          personName: "Sarah",
          token: null,
        },
      ],
      isSuppressed: async () => false,
      sendSms,
      sendEmail: sendItem17Email,
    } as never;

    await notifyRecipientOfTaskEvent(page, opts, senders);

    expect(sendSms).toHaveBeenCalledTimes(1);
    // A thrown SMS used to abandon the loop, so the email fallback never ran.
    expect(sendItem17Email).toHaveBeenCalledTimes(1);
  });
});
