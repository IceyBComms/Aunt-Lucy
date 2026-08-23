import { describe, it, expect, vi, beforeEach } from "vitest";

// The channel decision for bug #013, tested at the level the bug lived at: not
// "does the copy read well" but "does a phone-only helper actually get sent
// something, and does a contact that is really a NAME get refused".

interface SmsCall {
  to: string;
  body: string;
  label?: string;
}
interface EmailCall {
  slotId: string;
  releaseUrl?: string | null;
  calendarUrl?: string | null;
}

const sendSms = vi.fn(async (_args: SmsCall) => true);
const sendClaimConfirmation = vi.fn(async (_params: EmailCall) => {});
const warn = vi.fn((_ctx: Record<string, unknown>, _msg: string) => {});

vi.mock("./sms", () => ({ sendSms: (args: SmsCall) => sendSms(args) }));
vi.mock("./email", () => ({
  sendClaimConfirmation: (params: EmailCall) => sendClaimConfirmation(params),
}));
vi.mock("./logger", () => ({
  logger: {
    warn: (ctx: Record<string, unknown>, msg: string) => warn(ctx, msg),
    info: () => {},
    error: () => {},
  },
}));

const { sendClaimConfirmationToHelper } = await import("./claimNotify");

const base = {
  slotId: "slot-abc-123",
  helperFirstName: "Jane",
  recipientName: "Sarah Chen",
  slotType: "meal",
  customLabel: null,
  slotDate: "2026-08-28",
  slotTime: "18:00",
  liftWaitMode: null,
  notes: null,
  dietaryNotes: null,
  headcount: null,
  location: "Marrickville",
  cancelToken: "c".repeat(48),
  calendarToken: "d".repeat(48),
};

beforeEach(() => {
  sendSms.mockClear();
  sendClaimConfirmation.mockClear();
  warn.mockClear();
});

describe("sendClaimConfirmationToHelper", () => {
  it("texts a helper who claimed with a phone number", async () => {
    await sendClaimConfirmationToHelper({ ...base, helperContact: "0412 345 678" });

    expect(sendClaimConfirmation).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalledTimes(1);
    const [{ to, body, label }] = sendSms.mock.calls[0];
    expect(to).toBe("0412 345 678");
    // The release link is the whole point of the fix.
    expect(body).toContain(`/release/${base.cancelToken}`);
    // Labelled so PR #59's segment warning names this template.
    expect(label).toBe("helperClaimConfirmed");
  });

  it("emails a helper who claimed with an address, with both links", async () => {
    await sendClaimConfirmationToHelper({ ...base, helperContact: "jane@example.com" });

    expect(sendSms).not.toHaveBeenCalled();
    const [params] = sendClaimConfirmation.mock.calls[0];
    expect(params.releaseUrl).toContain(`/release/${base.cancelToken}`);
    expect(params.calendarUrl).toContain(`webcal://`);
    expect(params.slotId).toBe("slot-abc-123");
  });

  it("never hands a NAME to Twilio — it warns instead", async () => {
    // The real fallback written by the trusted-invite claim path when the invite
    // carried neither mobile nor email (routes/invites.ts).
    await sendClaimConfirmationToHelper({ ...base, helperContact: "Jane Smith" });

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendClaimConfirmation).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("names the slot id in that warning, and never the contact", async () => {
    await sendClaimConfirmationToHelper({ ...base, helperContact: "Jane Smith" });

    const [ctx, msg] = warn.mock.calls[0];
    expect(ctx).toEqual({ slotId: "slot-abc-123" });
    expect(JSON.stringify(ctx) + msg).not.toContain("Jane");
  });

  it("warns rather than throwing when there is no contact at all", async () => {
    await sendClaimConfirmationToHelper({ ...base, helperContact: null });
    expect(sendSms).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("omits the calendar link for an undated task", async () => {
    await sendClaimConfirmationToHelper({
      ...base,
      slotDate: null,
      slotTime: null,
      helperContact: "jane@example.com",
    });
    const [params] = sendClaimConfirmation.mock.calls[0];
    expect(params.calendarUrl).toBeNull();
  });

  it("omits the calendar link for a claim made before calendar_token existed", async () => {
    await sendClaimConfirmationToHelper({
      ...base,
      calendarToken: null,
      helperContact: "jane@example.com",
    });
    const [params] = sendClaimConfirmation.mock.calls[0];
    expect(params.calendarUrl).toBeNull();
  });
});
