import { describe, it, expect, vi, beforeEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import RestExceptionModule from "twilio/lib/base/RestException";

// PR #127 follow-up A. notifyOutcome redacts the `to` it writes — but the same
// line carries the provider's error, and a provider error can carry the
// destination (and worse). This file checks the line as it is actually WRITTEN:
// a real pino instance, pino's default serialisers, the JSON that would reach
// Railway — not the object handed to the logger, which is where a mocked logger
// stops looking and where #116's lesson says leaks hide.
//
// Every "is absent" assertion sits next to a "the line was written and carries
// the diagnosis" assertion (P2 — absence passes for free on a path that never ran).

const lines: string[] = [];
const sink = new Writable({
  write(chunk, _enc, cb) {
    lines.push(chunk.toString());
    cb();
  },
});
const realPino = pino({ level: "info" }, sink);

vi.mock("./logger", () => ({ logger: realPino }));

const { attemptSend, attemptBooleanSend, scrubContactPoints } = await import("./notifyOutcome");

// twilio ships this as CJS with a `default` export.
const RestException = ((RestExceptionModule as unknown as { default?: unknown }).default ??
  RestExceptionModule) as new (response: { statusCode: number; body: string }) => Error;

const MOBILE = "+61400000789";
const MOBILE_DIGITS = "61400000789";

function written(): string {
  expect(lines).toHaveLength(1);
  return lines[0];
}

beforeEach(() => {
  lines.length = 0;
});

describe("Twilio refusing a number (RestException, error 21211)", () => {
  // The body Twilio returns for 21211. Its message quotes the number back in
  // full — real-world format: "The 'To' number +27… is not a valid phone number."
  const refusal = () =>
    new RestException({
      statusCode: 400,
      body: JSON.stringify({
        code: 21211,
        message: `The 'To' number ${MOBILE} is not a valid phone number.`,
        more_info: "https://www.twilio.com/docs/errors/21211",
        status: 400,
      }),
    });

  it("keeps status, code and message — without the number", async () => {
    const ok = await attemptBooleanSend({ label: "probe", channel: "sms", to: MOBILE }, async () => {
      throw refusal();
    });

    expect(ok).toBe(false);
    const line = written();
    const parsed = JSON.parse(line);
    // Positive: the diagnosis survived.
    expect(parsed.msg).toBe("Notification failed");
    expect(parsed.error.status).toBe(400);
    expect(parsed.error.code).toBe(21211);
    expect(parsed.error.moreInfo).toBe("https://www.twilio.com/docs/errors/21211");
    expect(parsed.error.message).toBe("The 'To' number …789 is not a valid phone number.");
    // Absent: the number, anywhere on the line (message, reason, stack).
    expect(line).not.toContain(MOBILE_DIGITS);
    expect(parsed.error.stack).toBeUndefined();
  });
});

describe("Twilio failing at the network (what axios throws)", () => {
  // The shape of the AxiosError the real Twilio client throws on a DNS / socket
  // failure — captured from a real run on 18 Sep 2026 with fake credentials.
  // pino's serialiser copies every enumerable field, so before this fix the line
  // carried config.data (SMS body, invite token, To number) and
  // config.headers.Authorization (the Twilio SID + auth token, base64'd).
  const AUTH = "Basic " + Buffer.from("AC0000:FAKE_AUTH_TOKEN").toString("base64");
  const networkFailure = () =>
    Object.assign(new Error("getaddrinfo ENOTFOUND api.twilio.com"), {
      name: "Error",
      code: "ENOTFOUND",
      isAxiosError: true,
      config: {
        url: "https://api.twilio.com/2010-04-01/Accounts/AC0000/Messages.json",
        data: `To=%2B61400000789&From=%2B61400000111&Body=Join%20https%3A%2F%2Fauntlucy.com.au%2Finvite%2FSECRETTOKEN123`,
        headers: { Authorization: AUTH },
      },
      request: { _header: `POST /Messages.json HTTP/1.1\r\nAuthorization: ${AUTH}\r\n` },
    });

  it("keeps the code and message — and none of the request", async () => {
    const ok = await attemptBooleanSend({ label: "probe", channel: "sms", to: MOBILE }, async () => {
      throw networkFailure();
    });

    expect(ok).toBe(false);
    const line = written();
    const parsed = JSON.parse(line);
    expect(parsed.error.code).toBe("ENOTFOUND");
    expect(parsed.error.message).toBe("getaddrinfo ENOTFOUND api.twilio.com");
    expect(line).not.toContain("Basic ");
    expect(line).not.toContain(Buffer.from("AC0000:FAKE_AUTH_TOKEN").toString("base64"));
    expect(line).not.toContain("SECRETTOKEN123");
    expect(line).not.toContain(MOBILE_DIGITS);
    expect(parsed.error.config).toBeUndefined();
    expect(parsed.error.request).toBeUndefined();
  });
});

describe("Resend refusing a send (a returned { error })", () => {
  it("keeps statusCode, name and message, and scrubs any address in it", async () => {
    // Resend's documented testing-mode 403 — the only documented Resend message
    // that quotes an address (the account owner's, not the recipient's).
    const { error } = await attemptSend(
      { label: "probe", channel: "email", to: "sarah@gmail.com" },
      async () => ({
        error: {
          statusCode: 403,
          name: "validation_error",
          message: "You can only send testing emails to your own email address (owner@example.org).",
        },
      }),
    );

    expect(error?.name).toBe("validation_error");
    const line = written();
    const parsed = JSON.parse(line);
    expect(parsed.to).toBe("…@gmail.com");
    expect(parsed.error.statusCode).toBe(403);
    expect(parsed.error.name).toBe("validation_error");
    expect(parsed.error.message).toContain("your own email address (…@example.org)");
    expect(line).not.toContain("owner@");
    expect(line).not.toContain("sarah");
  });
});

describe("scrubContactPoints", () => {
  it("takes out numbers and addresses and leaves the rest", () => {
    expect(scrubContactPoints("to +61 400 000 789 failed")).toBe("to …789 failed");
    expect(scrubContactPoints("to 0400000789 failed")).toBe("to …789 failed");
    expect(scrubContactPoints("bounced: sarah.jones@gmail.com")).toBe("bounced: …@gmail.com");
    // Not contact points — must survive.
    expect(scrubContactPoints("error 21211 on 2026-09-18 from 10.0.0.1")).toBe(
      "error 21211 on 2026-09-18 from 10.0.0.1",
    );
  });
});
