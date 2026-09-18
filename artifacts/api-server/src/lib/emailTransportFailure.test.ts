import { describe, it, expect, vi, beforeEach } from "vitest";

// Bug #123, tested at the level the bug actually lived at: a real sender in
// lib/email.ts, with a Resend client that REJECTS rather than one that returns
// an error object. The returned-{ error } case was always handled; the thrown
// case was not, and the difference was invisible because nothing logged it.

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (payload: unknown) => send(payload) };
  },
}));

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

// email.ts builds its Resend client at import time from this, and treats a key
// containing "placeholder" as local dev (which sends nothing at all).
process.env.RESEND_API_KEY = "re_test_key_for_vitest";

const { sendItem17Email, sendGiftDelivery } = await import("./email");

const item17 = {
  to: "sarah@example.com",
  subject: "Your task has changed",
  body: "Priya can no longer make Friday.",
  link: null,
};

beforeEach(() => {
  send.mockReset();
  info.mockClear();
  warn.mockClear();
  error.mockClear();
});

describe("the email transport THROWS", () => {
  it("logs a failure, returns false, and does not throw past the sender", async () => {
    send.mockRejectedValue(new Error("ECONNRESET"));

    const result = await sendItem17Email(item17);

    // Positive control first: the transport really was reached.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);

    expect(error).toHaveBeenCalledTimes(1);
    const [ctx, msg] = error.mock.calls[0];
    expect(msg).toBe("Notification failed");
    expect(ctx.label).toBe("item17");
    expect(String(ctx.reason)).toContain("ECONNRESET");
    // It is not also claimed as a success.
    expect(info).not.toHaveBeenCalled();
  });

  it("does not silently succeed for a fire-and-forget caller", async () => {
    send.mockRejectedValue(new Error("socket hang up"));

    // `void sendItem17Email(...)` is how notifyHelperOfTaskEvent reaches this.
    // The rejection used to escape into an unhandled promise: no log, no error,
    // and the release that triggered it still reported success.
    await expect(sendItem17Email(item17)).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("still honours a sender whose contract is to throw on to its caller", async () => {
    // sendGiftDelivery throws so routes/internal.ts can mark the gift_message
    // row failed and retry it. A network rejection must reach that same branch,
    // not quietly become a false the cron would count as delivered.
    send.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      sendGiftDelivery({
        to: "sarah@example.com",
        recipientFirstName: "Sarah",
        buyerFirstName: "Mel",
        giftLink: "https://www.auntlucy.com.au/gift/abc",
        occasion: "new_baby",
      }),
    ).rejects.toThrow(/Resend error/);

    expect(send).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toBe("Notification failed");
  });
});

describe("the email transport RETURNS { error } — unchanged behaviour", () => {
  it("still returns false and still logs, exactly as before", async () => {
    send.mockResolvedValue({ error: { name: "validation_error", message: "Invalid `to`" } });

    const result = await sendItem17Email(item17);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0].reason)).toBe("Invalid `to`");
    expect(info).not.toHaveBeenCalled();
  });

  it("still throws on to the caller from a sender whose contract is to throw", async () => {
    send.mockResolvedValue({ error: { name: "rate_limit", message: "Too many requests" } });

    await expect(
      sendGiftDelivery({
        to: "sarah@example.com",
        recipientFirstName: "Sarah",
        buyerFirstName: "Mel",
        giftLink: "https://www.auntlucy.com.au/gift/abc",
        occasion: "new_baby",
      }),
    ).rejects.toThrow(/Resend error/);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("the email transport SUCCEEDS", () => {
  it("logs one success line, redacted, and returns true", async () => {
    send.mockResolvedValue({ error: null });

    const result = await sendItem17Email(item17);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
    const [ctx, msg] = info.mock.calls[0];
    expect(msg).toBe("Notification sent");
    expect(ctx.label).toBe("item17");
    expect(ctx.to).toBe("…@example.com");
    expect(error).not.toHaveBeenCalled();
  });

  it("puts the real address on the wire while keeping it out of the log", async () => {
    send.mockResolvedValue({ error: null });

    await sendItem17Email(item17);

    // The message goes where it should...
    expect(send.mock.calls[0][0]).toMatchObject({ to: "sarah@example.com" });
    // ...and the log still cannot be read back to a person (bug #116).
    expect(JSON.stringify(info.mock.calls[0][0])).not.toContain("sarah@example.com");
  });
});
