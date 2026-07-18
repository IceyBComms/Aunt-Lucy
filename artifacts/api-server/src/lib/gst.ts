/**
 * Australian GST maths and money formatting for tax receipts.
 *
 * Every amount in the system is a GST-INCLUSIVE integer number of cents — the
 * price the customer actually paid. The ex-GST and GST components are derived
 * from it here and nowhere else, so the rate is read in exactly one place.
 */

const DEFAULT_TAX_RATE = 0.1;

/**
 * The GST rate, from TAX_RATE (e.g. "0.10"). Falls back to 10% if unset or
 * unparseable rather than throwing — a missing env var must never stop a
 * customer's receipt going out, and 10% is the correct rate today anyway.
 */
function taxRate(): number {
  const raw = process.env.TAX_RATE;
  if (!raw) return DEFAULT_TAX_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) {
    return DEFAULT_TAX_RATE;
  }
  return parsed;
}

export interface GstBreakdown {
  totalCents: number;
  exGstCents: number;
  gstCents: number;
  /**
   * False for a $0 comp. A $0 sale isn't a taxable supply, so the receipt drops
   * the "Tax Invoice" header and the GST lines entirely rather than printing
   * zeroes — see EMAIL_TEMPLATES.md.
   */
  isTaxable: boolean;
}

/**
 * Splits a GST-inclusive amount into its ex-GST and GST components.
 *
 * gstCents is derived by subtraction rather than by a second rounding, so the
 * two components always add back to exactly the total the customer was charged.
 */
export function gstBreakdown(amountCents: number): GstBreakdown {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { totalCents: 0, exGstCents: 0, gstCents: 0, isTaxable: false };
  }

  const exGstCents = Math.round(amountCents / (1 + taxRate()));
  return {
    totalCents: amountCents,
    exGstCents,
    gstCents: amountCents - exGstCents,
    isTaxable: true,
  };
}

/** The GST rate as a whole-number percentage, for the "GST (10%)" label. */
export function gstRateLabel(): string {
  return `${Math.round(taxRate() * 100)}%`;
}

/** 5900 -> "59.00". Callers add the "$" and " AUD" themselves. */
export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
