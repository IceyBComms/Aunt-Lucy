/**
 * The trusted invite's "Yes, I'll help with this" request — exactly as the page
 * sends it, in one place.
 *
 * It lives here rather than inline in InviteClaim.tsx so that the api-server test
 * (lib/inviteClaim.test.ts) can send the claim through THIS function and the real
 * apiFetch, rather than a hand-written copy. Every rehearsal from July to
 * September sent the claim WITH a JSON body; the button never has, and that gap
 * hid a crash that failed every invited helper for eight weeks. A test built
 * from its own idea of the request cannot tell "works" from "works for the test".
 *
 * Note: NO body. That is the real request, and must stay the real request here —
 * if the page ever starts sending one, change it here and the test follows.
 *
 * Relative imports only: the api-server test loads this file outside rally's
 * `@/` alias.
 */
import { apiFetch } from "./api";

export interface InviteClaimResponse {
  cancelToken?: string;
  calendarUrl?: string | null;
}

export function claimInvite(token: string): Promise<InviteClaimResponse> {
  return apiFetch<InviteClaimResponse>(`/invite/${token}/claim`, { method: "POST" });
}
