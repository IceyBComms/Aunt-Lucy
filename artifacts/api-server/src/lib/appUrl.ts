/**
 * Resolves the public base URL of the app, used to build user-facing links such
 * as magic-link sign-in URLs and trusted-helper invite URLs.
 *
 * Precedence (must stay consistent across every email/SMS link we send):
 *   1. APP_URL           — set in production (e.g. https://www.auntlucy.com.au).
 *                          Always preferred so production links never leak a dev domain.
 *   2. REPLIT_DEV_DOMAIN — fallback for the Replit workspace when APP_URL is absent.
 *   3. http://localhost:21112 — final fallback for a bare local run.
 *
 * The returned value never has a trailing slash.
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:21112");

  return raw.replace(/\/+$/, "");
}
