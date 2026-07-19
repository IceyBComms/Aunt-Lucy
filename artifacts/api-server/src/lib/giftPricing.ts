/**
 * Tier naming and the customer-facing receipt reference.
 *
 * The gifts table has no tier column — Item 2 sends the buyer to a per-tier
 * Stripe payment link and we learn the amount back from the webhook — so the
 * tier is recovered from the amount paid. Prices are GST-inclusive cents and
 * must stay in step with the pricing in CLAUDE.md.
 */

type Tier = {
  name: string;
  /** How many separate gifts the buyer has paid for. */
  gifts: number;
};

const TIERS_BY_AMOUNT_CENTS: Record<number, Tier> = {
  0: { name: "Aunt Lucy VIP — complimentary", gifts: 1 },
  5900: { name: "Aunt Lucy Personal Gift", gifts: 1 },
  7900: { name: "Aunt Lucy Workplace — individual gift", gifts: 1 },
  32900: { name: "Aunt Lucy Workplace — 5-pack", gifts: 5 },
  54900: { name: "Aunt Lucy Workplace — 10-pack", gifts: 10 },
};

/**
 * The receipt line description for an amount paid.
 *
 * An unrecognised amount still produces a valid receipt: a discounted or
 * one-off price must never leave the description blank, so it falls back to a
 * generic label rather than throwing.
 */
export function tierName(amountCents: number): string {
  return TIERS_BY_AMOUNT_CENTS[amountCents]?.name ?? "Aunt Lucy Gift";
}

/**
 * How many gifts an amount buys. An unrecognised amount is assumed to be one
 * gift, matching the tierName() fallback — a discounted individual gift is far
 * likelier than an unlisted pack.
 */
export function giftsPurchased(amountCents: number): number {
  return TIERS_BY_AMOUNT_CENTS[amountCents]?.gifts ?? 1;
}

/**
 * TODO(multi-gift): the 5-pack and 10-pack tiers MUST NOT be sold or fulfilled
 * until multi-gift fulfilment exists.
 *
 * The whole purchase→fulfilment path assumes one payment produces exactly one
 * gift row: checkout carries a single `client_reference_id`, and fulfilPaidGift
 * delivers that one gift. A pack payment arriving today would therefore quietly
 * deliver ONE gift for $329 or $549 — the buyer is charged for 5 or 10 and the
 * other 4 or 9 recipients simply never exist. Silent under-delivery of a paid
 * order is the worst failure mode this flow has, so isUnfulfillableTier() makes
 * the webhook refuse it and escalate to a human instead.
 *
 * Building it properly needs, at minimum: a pack/order concept above the gift
 * row (one payment → N gifts), a way for the buyer to name N recipients after
 * paying rather than at checkout, and a receipt that itemises the pack once
 * instead of N times.
 *
 * Sale side — no code guard is possible here: the packs are sold through Stripe
 * payment links created in the Stripe dashboard, not from this repo. Those two
 * links must stay deactivated (and off the /employers page) until this is done.
 */
export function isUnfulfillableTier(amountCents: number): boolean {
  return giftsPurchased(amountCents) > 1;
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