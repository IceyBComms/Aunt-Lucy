/**
 * Money formatting for the buyer-facing pages.
 *
 * Every amount in the system is a GST-INCLUSIVE integer number of cents. The
 * ex-GST split is derived on the server for the tax invoice (api-server
 * lib/gst.ts) and never here — the buyer only ever sees the total they pay.
 */

/** 5900 -> "$59". A price with cents keeps them: 5950 -> "$59.50". */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}
