/**
 * Tier naming and the customer-facing receipt reference.
 *
 * The gifts table has no tier column — Item 2 sends the buyer to a per-tier
 * Stripe payment link and we learn the amount back from the webhook — so the
 * tier is recovered from the amount paid. Prices are GST-inclusive cents and
 * must stay in step with the pricing in CLAUDE.md.
 */

const TIER_NAMES_BY_AMOUNT_CENTS: Record<number, string> = {
  0: "Aunt Lucy VIP — complimentary",
  5900: "Aunt Lucy Personal Gift",
  7900: "Aunt Lucy Workplace — individual gift",
  32900: "Aunt Lucy Workplace — 5-pack",
  54900: "Aunt Lucy Workplace — 10-pack",
};

/**
 * The receipt line description for an amount paid.
 *
 * An unrecognised amount still produces a valid receipt: a discounted or
 * one-off price must never leave the description blank, so it falls back to a
 * generic label rather than throwing.
 */
export function tierName(amountCents: number): string {
  return TIER_NAMES_BY_AMOUNT_CENTS[amountCents] ?? "Aunt Lucy Gift";
}

/**
 * The human-quotable receipt number, e.g. "AL-3F9A2C1B".
 *
 * Derived from the gift id so it needs no separate sequence and stays stable
 * if a receipt is ever re-sent. Uppercased hex reads cleanly over the phone.
 */
export function giftReference(giftId: string): string {
  return `AL-${giftId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}