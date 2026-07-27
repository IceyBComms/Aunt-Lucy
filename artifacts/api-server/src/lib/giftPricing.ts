/**
 * The gift tiers — the single source of truth for what can be bought, for how
 * much, and where the buyer is sent to pay.
 *
 * This file is read from both directions:
 *
 *  - Forwards (Item 2, the purchase flow): the tier picker lists SELLABLE_TIERS
 *    and POST /gifts uses the chosen tier's amountCents and paymentLink. No
 *    price is ever hardcoded in the frontend or accepted from the client.
 *  - Backwards (Item 3, fulfilment): the gifts table has no tier column — the
 *    buyer is sent to a per-tier Stripe payment link and we learn the amount
 *    back from the webhook — so the tier is recovered from the amount paid.
 *
 * Both directions read the same TIERS array, so the receipt description can
 * never drift from the price the buyer was actually charged.
 *
 * Prices are GST-INCLUSIVE integer cents, in every tier including the workplace
 * ones. HR buyers get the GST itemised on the tax invoice (see lib/gst.ts) and
 * claim it back from there — we do not quote ex-GST prices anywhere, because
 * the Stripe payment links charge the inclusive amount. Prices must stay in
 * step with the pricing in CLAUDE.md.
 */

export type GiftTierId =
  | "consumer_personal"
  | "workplace_individual"
  | "workplace_5pack"
  | "workplace_10pack";

export type GiftTier = {
  id: GiftTierId;
  /** The receipt line description. */
  name: string;
  /** The buyer-facing label on the tier picker. */
  label: string;
  /** One warm line explaining who the tier is for. */
  blurb: string;
  /** GST-inclusive price in cents. */
  amountCents: number;
  /** How many separate gifts the buyer has paid for. */
  gifts: number;
  /**
   * Whether this tier can be bought self-serve today. See the pack note below.
   * A tier with sellable: false has no paymentLink and is rejected by
   * POST /gifts, so it cannot be bought even by a hand-crafted request.
   */
  sellable: boolean;
  /** The Stripe payment link. Only ever present on a sellable tier. */
  paymentLink?: string;
};

/**
 * The Stripe payment links, created by hand in the Stripe dashboard rather than
 * from this repo. They are public URLs, not secrets — the env vars exist only so
 * a test-mode link can be substituted without a deploy.
 *
 * Outside production these live links are refused outright; see
 * resolvePaymentLink() below. A tier with no usable link is not sellable, so a
 * local or sandbox run answers 400 "isn't available to buy yet" rather than
 * sending anyone to a chargeable page. That 400 is the expected sandbox
 * behaviour, not a fault.
 *
 * TODO(pack-links): the 5-pack and 10-pack links also exist in the dashboard and
 * MUST stay deactivated until Item 12. They are deliberately not recorded here —
 * a URL that is not in the codebase cannot be leaked to a browser by accident.
 */
const LIVE_CONSUMER_PERSONAL_LINK =
  "https://buy.stripe.com/8x2fZaaPo6a7g4d2rhg7e0h";
const LIVE_WORKPLACE_INDIVIDUAL_LINK =
  "https://buy.stripe.com/bJe4gsf5E0PNf097LBg7e0g";

/**
 * Resolve a tier's payment link, refusing a live one outside production.
 *
 * Outside production a live link is treated as no link at all: the tier becomes
 * unsellable and POST /gifts answers 400. That is the point. Previously an unset
 * STRIPE_LINK_* env var fell back to the live link, so a sandbox run looked
 * entirely safe while the checkout button charged a real card $59 — the kind of
 * mistake you only find out about from a customer's bank statement.
 *
 * Stripe's own test-mode payment links are also on buy.stripe.com but their path
 * starts with /test_, so they are allowed through. Anything unparseable is
 * refused rather than trusted: the failure mode of a broken link is a 400, and
 * the failure mode of a wrong link is taking someone's money.
 */
function resolvePaymentLink(
  configured: string | undefined,
  liveFallback: string,
): string | undefined {
  const link = configured?.trim() || liveFallback;

  if (process.env.NODE_ENV === "production") return link;

  try {
    const url = new URL(link);
    const isStripeHosted = url.hostname === "buy.stripe.com";
    const isTestModeLink = url.pathname.startsWith("/test_");
    if (isStripeHosted && !isTestModeLink) return undefined;
    return link;
  } catch {
    return undefined;
  }
}

const CONSUMER_PERSONAL_LINK = resolvePaymentLink(
  process.env.STRIPE_LINK_CONSUMER_PERSONAL,
  LIVE_CONSUMER_PERSONAL_LINK,
);

const WORKPLACE_INDIVIDUAL_LINK = resolvePaymentLink(
  process.env.STRIPE_LINK_WORKPLACE_INDIVIDUAL,
  LIVE_WORKPLACE_INDIVIDUAL_LINK,
);

export const TIERS: readonly GiftTier[] = [
  {
    id: "consumer_personal",
    name: "Aunt Lucy Personal Gift",
    label: "Gift Aunt Lucy",
    blurb:
      "For a friend, a sister, a neighbour — one gift page, theirs to open when they're ready.",
    amountCents: 5900,
    gifts: 1,
    sellable: true,
    paymentLink: CONSUMER_PERSONAL_LINK,
  },
  {
    id: "workplace_individual",
    name: "Aunt Lucy Workplace — individual gift",
    label: "Buy for a team member",
    blurb:
      "One gift page for one employee heading off on leave. Tax invoice with ABN included.",
    amountCents: 7900,
    gifts: 1,
    sellable: true,
    paymentLink: WORKPLACE_INDIVIDUAL_LINK,
  },
  {
    id: "workplace_5pack",
    name: "Aunt Lucy Workplace — 5-pack",
    label: "Team of 5",
    blurb: "Five gift pages to hand out across the year.",
    amountCents: 32900,
    gifts: 5,
    sellable: false,
  },
  {
    id: "workplace_10pack",
    name: "Aunt Lucy Workplace — 10-pack",
    label: "Team of 10",
    blurb: "Ten gift pages to hand out across the year.",
    amountCents: 54900,
    gifts: 10,
    sellable: false,
  },
];

/**
 * The tier a buyer may actually be charged for. Anything not in here has no
 * payment link, so there is no URL to redirect to even if the id is guessed.
 */
export function sellableTier(id: string): GiftTier | undefined {
  const tier = TIERS.find((t) => t.id === id);
  return tier?.sellable && tier.paymentLink ? tier : undefined;
}

/**
 * Amount paid -> tier, for the fulfilment side. A $0 comp is recognised so a
 * complimentary gift still gets a sensible receipt line.
 */
const COMPLIMENTARY: GiftTier = {
  id: "consumer_personal",
  name: "Aunt Lucy VIP — complimentary",
  label: "Complimentary",
  blurb: "",
  amountCents: 0,
  gifts: 1,
  sellable: false,
};

function tierByAmount(amountCents: number): GiftTier | undefined {
  if (amountCents === 0) return COMPLIMENTARY;
  return TIERS.find((t) => t.amountCents === amountCents);
}

/**
 * The receipt line description for an amount paid.
 *
 * An unrecognised amount still produces a valid receipt: a discounted or
 * one-off price must never leave the description blank, so it falls back to a
 * generic label rather than throwing.
 */
export function tierName(amountCents: number): string {
  return tierByAmount(amountCents)?.name ?? "Aunt Lucy Gift";
}

/**
 * How many gifts an amount buys. An unrecognised amount is assumed to be one
 * gift, matching the tierName() fallback — a discounted individual gift is far
 * likelier than an unlisted pack.
 */
export function giftsPurchased(amountCents: number): number {
  return tierByAmount(amountCents)?.gifts ?? 1;
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
 * Sale side — the packs carry sellable: false above, so GET /gift-tiers returns
 * them without a link and POST /gifts refuses to create a row for them. That
 * covers everything sold from this repo. It cannot cover the pack payment links
 * that exist in the Stripe dashboard, which must stay deactivated until Item 12
 * — hence this webhook-side guard as the backstop.
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
