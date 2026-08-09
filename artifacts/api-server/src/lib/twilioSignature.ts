import twilio from "twilio";
import { getAppBaseUrl } from "./appUrl";

// Read once at module load, same as the Stripe webhook reads its secret. Absent
// at boot ⇒ every request is treated as unverifiable and rejected (fail closed),
// mirroring the INTERNAL_CRON_SECRET gate rather than waving traffic through.
const authToken = process.env.TWILIO_AUTH_TOKEN;

/**
 * The exact public URL Twilio is configured to POST inbound SMS to.
 *
 * Twilio signs the request over this URL string character-for-character (scheme,
 * host, path, query, trailing slash — all significant), so it MUST equal the
 * "A MESSAGE COMES IN" webhook URL in the Twilio console. The route is mounted
 * at /api, so the default is APP_URL + "/api/twilio/inbound".
 *
 * It is built from configuration, never reconstructed from the request: behind
 * Railway's proxy `req.protocol` can read "http" while Twilio signed the "https"
 * URL, which would make every real request fail verification. If the console
 * points somewhere other than APP_URL (e.g. straight at the Railway domain),
 * TWILIO_INBOUND_WEBHOOK_URL pins the exact value without code changes.
 */
export function inboundWebhookUrl(): string {
  const override = process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim();
  return override || `${getAppBaseUrl()}/api/twilio/inbound`;
}

export type TwilioVerification =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "missing_signature" | "bad_signature";
    };

/**
 * Fail-closed verification of an inbound Twilio webhook.
 *
 * - No auth token configured ⇒ "not_configured" (reject, and the caller logs a
 *   config error — a real Twilio request we can't verify is still refused).
 * - No x-twilio-signature header ⇒ "missing_signature".
 * - Signature present but invalid ⇒ "bad_signature".
 *
 * `params` is the parsed x-www-form-urlencoded body exactly as Twilio sent it
 * (express.urlencoded populates req.body); validateRequest re-derives the HMAC
 * from url + those params. Never let the caller log the sender's number on any
 * reject path — a PII-logging cleanup is already queued for optout.ts.
 */
export function verifyTwilioRequest(
  signature: string | string[] | undefined,
  url: string,
  params: Record<string, unknown> | undefined,
  token: string | undefined = authToken,
): TwilioVerification {
  if (!token) {
    return { ok: false, reason: "not_configured" };
  }
  if (typeof signature !== "string" || signature.length === 0) {
    return { ok: false, reason: "missing_signature" };
  }
  const valid = twilio.validateRequest(token, signature, url, params ?? {});
  return valid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
