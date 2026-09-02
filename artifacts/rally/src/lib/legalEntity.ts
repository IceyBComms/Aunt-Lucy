/**
 * The legal entity behind Aunt Lucy — ONE source for the frontend. Bug #095.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The legal name and ABN were hardcoded in SIX places before this file: three
 * in TermsOfService.tsx, three in PrivacyPolicy.tsx, none of them calling
 * anything shared. #095 added a seventh surface — the website footer — and the
 * footer's whole job is BEING CHECKABLE. A reader who suspects a scam types the
 * ABN into the public register. Seven independent copies of a number like that
 * is a drift bug waiting to be a credibility bug, and #092 already proved the
 * cost: a wrong legal entity on a tax document, in production.
 *
 * So every visible mention of the entity in this package now reads from here.
 *
 * ── THE REMAINING GAP, STATED HONESTLY ──────────────────────────────────────
 * The API has its OWN pair — supplierName() / supplierAbn() in
 * artifacts/api-server/src/lib/email.ts — which the tax receipt and the email
 * footer band use, and which read BUSINESS_LEGAL_NAME / BUSINESS_ABN from the
 * environment. That is deliberate on the API's side (a receipt is a tax
 * document; the entity on it must be settable without a deploy) and it cannot
 * import from the frontend. So this is TWO sources, not one — but two instead
 * of eight, and a drift test fails the build if the two ever disagree — see
 * artifacts/api-server/src/lib/legalEntityDrift.test.ts.
 */
export const LEGAL_ENTITY = {
  /** Registered/trading name. Matches supplierName()'s default in the API. */
  name: "Icebreaker Communications",
  /**
   * Spaced exactly as the ABR prints it, and exactly as the tax receipt and
   * the legal pages already do. Do not reformat: a reader checking this
   * against the public register is the entire point.
   */
  abn: "34 327 702 731",
  /** Trading address, as it appears in the Terms. */
  address: "Pascoe Vale South, Victoria 3044, Australia",
} as const;
