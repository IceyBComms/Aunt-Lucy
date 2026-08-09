import { describe, it, expect } from "vitest";
import twilio from "twilio";
import { verifyTwilioRequest } from "./twilioSignature";

// A throwaway token used only to compute and check signatures in-process. No
// real credential is involved, and no network or DB is touched.
const TOKEN = "test_auth_token_1234567890";
const URL = "https://www.auntlucy.com.au/api/twilio/inbound";

// A representative inbound-STOP payload, the flat form fields Twilio POSTs.
const PARAMS = {
  From: "+61400000000",
  To: "+61400111222",
  Body: "STOP",
  MessageSid: "SM00000000000000000000000000000000",
  AccountSid: "AC00000000000000000000000000000000",
};

// Twilio's own helper produces the exact signature Twilio would send, so these
// tests exercise the real HMAC algorithm rather than a mock of it.
const validSignature = twilio.getExpectedTwilioSignature(TOKEN, URL, PARAMS);

describe("verifyTwilioRequest", () => {
  it("accepts a request whose signature Twilio itself would produce", () => {
    const result = verifyTwilioRequest(validSignature, URL, PARAMS, TOKEN);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a forged/incorrect signature with reason bad_signature", () => {
    const result = verifyTwilioRequest(
      "obviously-not-a-real-signature",
      URL,
      PARAMS,
      TOKEN,
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a request with no signature header (undefined)", () => {
    const result = verifyTwilioRequest(undefined, URL, PARAMS, TOKEN);
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects an empty signature header", () => {
    const result = verifyTwilioRequest("", URL, PARAMS, TOKEN);
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("fails closed when no auth token is configured", () => {
    const result = verifyTwilioRequest(validSignature, URL, PARAMS, undefined);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("rejects a valid signature computed for a different URL", () => {
    // The classic proxy-scheme trap: same params, http:// instead of https://.
    const httpUrl = URL.replace("https://", "http://");
    const sigForHttp = twilio.getExpectedTwilioSignature(TOKEN, httpUrl, PARAMS);
    const result = verifyTwilioRequest(sigForHttp, URL, PARAMS, TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects when the body has been tampered with after signing", () => {
    const tampered = { ...PARAMS, Body: "START" };
    const result = verifyTwilioRequest(validSignature, URL, tampered, TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });
});
